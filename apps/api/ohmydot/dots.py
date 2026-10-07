"""Per-dot runtimes backed by separate local Docker desktops and artifact volumes."""
import asyncio
import json
from dataclasses import replace

import httpx
from sqlalchemy import select

from .runtime import Runtime
from .store import Conversation, Dot, Run

COLORS = {'silver': '#bdc1d2', 'blue': '#19b6de', 'yellow': '#ffcf35',
          'pink': '#d875d7', 'lime': '#b7d91a', 'rose': '#f2a5bb'}


class DotComputers:
    def __init__(self, config, store, default):
        self.config, self.store = config, store
        self.runtimes = {'dot-1': default}
        self.lock = asyncio.Lock()

    def profile(self, dot):
        appearance = json.loads(self.store.get_setting('dot-profile:' + dot.id, '{}'))
        return {'id': dot.id, 'name': dot.name, 'color': appearance.get('color', 'silver'),
                'avatar': appearance.get('avatar', 'pet'),
                'profile_saved': bool(appearance), 'computer_id': 'computer-1' if dot.id == 'dot-1' else 'computer-' + dot.id}

    def listing(self):
        with self.store.session() as db:
            return [self.profile(dot) for dot in db.scalars(select(Dot).order_by(Dot.id))]

    async def get(self, dot_id):
        with self.store.session() as db:
            dot = db.get(Dot, dot_id)
            if not dot:
                raise ValueError('Dot not found')
            profile = self.profile(dot)
        async with self.lock:
            if dot_id not in self.runtimes:
                endpoints = json.loads(self.store.get_setting('dot-computer:' + dot_id, '{}'))
                if not endpoints:
                    raise ValueError('Computer not configured')
                runtime = Runtime(replace(self.config, **endpoints), self.store)
                await runtime.start(recover=False)
                self.runtimes[dot_id] = runtime
                try:
                    await runtime.desktop.post('/appearance', {'accent': COLORS[profile['color']], 'name': profile['name']})
                except httpx.HTTPError:
                    pass
            return self.runtimes[dot_id]

    async def for_run(self, run_id):
        with self.store.session() as db:
            run = db.get(Run, run_id)
            if not run:
                raise ValueError('Run not found')
            dot_id = db.get(Conversation, run.conversation_id).dot_id
        return await self.get(dot_id)

    async def start(self):
        await self.runtimes['dot-1'].start(recover=False)
        for run_id in self.store.recover():
            try:
                runtime = await self.for_run(run_id)
                await runtime.shell.post('/cancel/' + run_id)
            except Exception:
                self.store.event('shell.cancel_failed', '재시작 후 셸 종료 확인 실패', run_id)

    async def stop(self):
        for runtime in self.runtimes.values():
            await runtime.stop()

    @staticmethod
    async def docker(*args):
        try:
            proc = await asyncio.create_subprocess_exec('docker', *args,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        except FileNotFoundError as exc:
            raise ValueError('Dot 컴퓨터를 만들려면 서버에 Docker가 필요합니다.') from exc
        try:
            out, _ = await asyncio.wait_for(proc.communicate(), 45)
        except TimeoutError:
            proc.kill()
            await proc.wait()
            raise ValueError('컴퓨터 준비 시간이 초과되었습니다. Docker 상태를 확인하세요.')
        if proc.returncode:
            raise ValueError('컴퓨터를 준비하지 못했습니다. Docker 실행 상태와 여유 공간을 확인하세요.')
        return out.decode().strip()

    async def provision(self, dot_id):
        # Clone deployment resource/network settings, never mount the Docker socket in an agent.
        created = []
        endpoints = {}
        try:
            for service, token, port in [('computer', self.config.computer_token, 8765),
                                          ('shell', self.config.shell_token, 8766)]:
                ids = (await self.docker('ps', '-q', '--filter', 'label=com.docker.compose.project=ohmydot',
                         '--filter', 'label=com.docker.compose.service=' + service)).splitlines()
                if len(ids) != 1:
                    raise ValueError('기본 Dot 컴퓨터 배포를 찾을 수 없습니다.')
                base = json.loads(await self.docker('inspect', ids[0]))[0]
                host = base['HostConfig']
                networks = list(base['NetworkSettings']['Networks'])
                name = 'ohmydot-' + dot_id + '-' + service
                args = ['create', '--name', name, '--label', 'ohmydots.dot=' + dot_id,
                        '--restart', 'unless-stopped', '--network', networks[0],
                        '-e', service.upper() + '_TOKEN=' + token,
                        '-p', '127.0.0.1::' + str(port),
                        '--mount', 'type=volume,source=ohmydot-' + dot_id + '-artifacts,target=/workspace/artifacts',
                        '--cap-drop', 'ALL']
                if service == 'computer':
                    args += ['-p', '127.0.0.1::6080', '--mount',
                             'type=volume,source=ohmydot-' + dot_id + '-home,target=/home/dot']
                else:
                    args += ['--mount', 'type=volume,source=ohmydot-' + dot_id + '-tools,target=/workspace/.tools']
                for cap in host.get('CapAdd') or []:
                    args += ['--cap-add', cap]
                for opt in host.get('SecurityOpt') or []:
                    args += ['--security-opt', opt]
                for path, options in (host.get('Tmpfs') or {}).items():
                    if path != '/home/dot':
                        args += ['--tmpfs', path + (':' + options if options else '')]
                for key, flag in [('Memory', '--memory'), ('ShmSize', '--shm-size'), ('PidsLimit', '--pids-limit')]:
                    if host.get(key):
                        args += [flag, str(host[key])]
                if host.get('NanoCpus'):
                    args += ['--cpus', str(host['NanoCpus'] / 1e9)]
                if host.get('ReadonlyRootfs'):
                    args += ['--read-only']
                await self.docker(*args, base['Config']['Image'])
                created.append(name)
                for network in networks[1:]:
                    await self.docker('network', 'connect', network, name)
                await self.docker('start', name)
                info = json.loads(await self.docker('inspect', name))[0]
                bindings = info['NetworkSettings']['Ports']
                endpoints[service + '_url'] = 'http://127.0.0.1:' + bindings[str(port) + '/tcp'][0]['HostPort']
                if service == 'computer':
                    endpoints['vnc_url'] = 'ws://127.0.0.1:' + bindings['6080/tcp'][0]['HostPort']
            async with httpx.AsyncClient(timeout=3) as client:
                for attempt in range(30):
                    try:
                        response = await client.get(endpoints['computer_url'] + '/health',
                            headers={'Authorization': 'Bearer ' + self.config.computer_token})
                        response.raise_for_status()
                        shell = await client.get(endpoints['shell_url'] + '/health',
                            headers={'Authorization': 'Bearer ' + self.config.shell_token})
                        shell.raise_for_status()
                        return endpoints
                    except httpx.HTTPError:
                        await asyncio.sleep(1)
            raise ValueError('새 컴퓨터가 아직 준비되지 않았습니다.')
        except BaseException:
            for name in created:
                await self.docker('rm', '-f', name)
            raise
