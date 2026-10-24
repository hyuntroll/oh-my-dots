"""Per-dot runtimes backed by separate local Docker desktops and artifact volumes."""
import asyncio
import json
from dataclasses import replace

import httpx
from sqlalchemy import select

from .runtime import Runtime
from .store import Conversation, Dot, Memory, Run, Setting

AVATARS = {'ring', 'pet', 'iggy', 'felipe', 'todd', 'alfred', 'jojo'}

COLORS = {'silver': '#bdc1d2', 'blue': '#19b6de', 'yellow': '#ffcf35',
          'pink': '#d875d7', 'lime': '#b7d91a', 'rose': '#f2a5bb'}

STATUSES = frozenset({'ACTIVE', 'PAUSED', 'ARCHIVED'})

# A dot that is paused or archived must not accept new work or computer input.
BLOCKING_STATUSES = frozenset({'PAUSED', 'ARCHIVED'})

SERVICES = (('computer', 8765), ('shell', 8766))


class LastDotError(ValueError):
    """Deleting the final dot would leave the deployment without a computer."""


class DotComputers:
    def __init__(self, config, store, default):
        self.config, self.store = config, store
        self.runtimes = {'dot-1': default}
        self.lock = asyncio.Lock()

    def profile(self, dot):
        appearance = json.loads(self.store.get_setting('dot-profile:' + dot.id, '{}'))
        return {'id': dot.id, 'name': dot.name, 'color': appearance.get('color', 'silver'),
                'avatar': appearance.get('avatar', 'pet'),
                'characterState': appearance.get('characterState'), 'characterImage': appearance.get('characterImage'),
                'profile_saved': bool(appearance), 'computer_id': 'computer-1' if dot.id == 'dot-1' else 'computer-' + dot.id,
                'status': dot.status or 'ACTIVE', 'pinned': bool(dot.pinned),
                'position': dot.position, 'created_at': dot.created_at,
                'last_active_at': dot.last_active_at}

    def row(self, dot_id):
        with self.store.session() as db:
            dot = db.get(Dot, dot_id)
            if not dot:
                raise ValueError('Dot not found')
            return dot

    def listing(self, include_archived=False):
        with self.store.session() as db:
            rows = list(db.scalars(select(Dot)))
        if not include_archived:
            rows = [dot for dot in rows if (dot.status or 'ACTIVE') != 'ARCHIVED']
        rows.sort(key=lambda dot: (not dot.pinned, dot.position if dot.position is not None else 1 << 30,
                                   dot.created_at or 0.0, dot.id))
        return [self.profile(dot) for dot in rows]

    def get_profile(self, dot_id):
        return self.profile(self.row(dot_id))

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
                if self.config.managed_computers:
                    endpoints = await self.container_endpoints(dot_id)
                    with self.store.session() as db:
                        db.get(Setting, 'dot-computer:' + dot_id).value = json.dumps(endpoints)
                        db.commit()
                runtime = Runtime(replace(self.config, **endpoints), self.store)
                await runtime.start(recover=False)
                self.runtimes[dot_id] = runtime
                await self.apply_appearance(runtime, profile)
            return self.runtimes[dot_id]

    async def apply_appearance(self, runtime, profile):
        """Saved appearance is reapplied whenever a computer (re)connects."""
        try:
            await runtime.desktop.post('/appearance', {'accent': COLORS[profile['color']], 'name': profile['name']})
        except (httpx.HTTPError, KeyError):
            pass

    async def for_run(self, run_id):
        with self.store.session() as db:
            run = db.get(Run, run_id)
            if not run:
                raise ValueError('Run not found')
            dot_id = db.get(Conversation, run.conversation_id).dot_id
        return await self.get(dot_id)

    def require_writable(self, dot_id):
        """Reject new work while a dot is paused or archived."""
        status = self.row(dot_id).status or 'ACTIVE'
        if status in BLOCKING_STATUSES:
            raise PermissionError('일시 중지된 Dot입니다. 재개한 뒤 다시 시도해 주세요.' if status == 'PAUSED'
                                  else '삭제된 Dot입니다.')
        return status

    def active_run(self, dot_id):
        runtime = self.runtimes.get(dot_id)
        return runtime.active_id if runtime else None

    # -- lifecycle ---------------------------------------------------------

    def set_status(self, dot_id, status):
        if status not in STATUSES:
            raise ValueError('Unknown dot status')
        self.row(dot_id)
        with self.store.session() as db:
            db.get(Dot, dot_id).status = status
            db.commit()
        return self.get_profile(dot_id)

    def set_pinned(self, dot_id, pinned):
        self.row(dot_id)
        with self.store.session() as db:
            dot = db.get(Dot, dot_id)
            dot.pinned = bool(pinned)
            db.commit()
        return self.get_profile(dot_id)

    def rename(self, dot_id, name):
        self.row(dot_id)
        with self.store.session() as db:
            dot = db.get(Dot, dot_id)
            key = 'dot-profile:' + dot_id
            setting = db.get(Setting, key)
            appearance = json.loads(setting.value) if setting else {}
            appearance['name'] = name
            dot.name = name
            if setting:
                setting.value = json.dumps(appearance)
            else:
                db.add(Setting(key=key, value=json.dumps(appearance)))
            db.commit()
        return self.get_profile(dot_id)

    def memories(self, dot_id):
        return self.store.memories(dot_id)

    def remember(self, dot_id, text):
        with self.store.session() as db:
            db.add(Memory(dot_id=dot_id, text=text))
            db.commit()
        return self.memories(dot_id)

    def forget(self, dot_id, memory_id):
        with self.store.session() as db:
            row = db.get(Memory, memory_id)
            if not row or row.dot_id != dot_id:
                raise ValueError('Memory not found')
            db.delete(row)
            db.commit()
        return self.memories(dot_id)

    async def pause(self, dot_id):
        """Stop a dot: cancel its current run and refuse new work until resumed."""
        profile = self.set_status(dot_id, 'PAUSED')
        runtime = self.runtimes.get(dot_id)
        cancelled = None
        if runtime and runtime.active_id:
            cancelled = runtime.active_id
            await runtime.cancel(cancelled)
        self.store.event('dot.paused', profile['name'] + ' 닷을 일시 중지했습니다', cancelled,
                         {'dot_id': dot_id, 'status': 'PAUSED'})
        return {**profile, 'cancelled_run_id': cancelled}

    async def resume(self, dot_id):
        profile = self.set_status(dot_id, 'ACTIVE')
        self.store.event('dot.resumed', profile['name'] + ' 닷을 재개했습니다', None,
                         {'dot_id': dot_id, 'status': 'ACTIVE'})
        return profile

    async def reboot(self, dot_id):
        """Restart a dot's computer and shell containers, then wait for health."""
        profile = self.get_profile(dot_id)
        names = []
        for service, _ in SERVICES:
            name = await self.find_container(dot_id, service)
            if name is None:
                raise ValueError('이 Dot의 컴퓨터를 찾을 수 없습니다. 배포 상태를 확인하세요.')
            names.append(name)
        for name in names:
            await self.docker('restart', name)
        endpoints = self.endpoints_for(dot_id)
        if self.config.managed_computers and dot_id != 'dot-1':
            endpoints = await self.container_endpoints(dot_id)
            with self.store.session() as db:
                row = db.get(Setting, 'dot-computer:' + dot_id)
                if row:
                    row.value = json.dumps(endpoints)
                    db.commit()
        if not endpoints:
            raise ValueError('Computer not configured')
        if not await self.wait_health(endpoints):
            raise ValueError('컴퓨터가 다시 시작되지 않았습니다. Docker 상태를 확인하세요.')
        runtime = self.runtimes.get(dot_id)
        if runtime is not None:
            await self.apply_appearance(runtime, profile)
        self.store.event('dot.rebooted', profile['name'] + '의 컴퓨터를 다시 시작했습니다', None,
                         {'dot_id': dot_id})
        return {**profile, 'restarted': names}

    def endpoints_for(self, dot_id):
        """Live endpoints for an attached dot, saved endpoints otherwise."""
        runtime = self.runtimes.get(dot_id)
        if runtime is not None:
            return {'computer_url': runtime.config.computer_url, 'shell_url': runtime.config.shell_url,
                    'vnc_url': runtime.config.vnc_url}
        return json.loads(self.store.get_setting('dot-computer:' + dot_id, '{}'))

    async def remove(self, dot_id):
        """Delete a dot: archive its conversations, drop its computer, hide the dot."""
        profile = self.get_profile(dot_id)
        if not [item for item in self.listing() if item['id'] != dot_id]:
            raise LastDotError('마지막 Dot은 삭제할 수 없습니다.')
        runtime = self.runtimes.pop(dot_id, None)
        if runtime is not None:
            await runtime.stop()
        # dot-1's containers belong to the base deployment, so only provisioned dots are torn down.
        if dot_id != 'dot-1':
            for service, _ in SERVICES:
                try:
                    name = await self.find_container(dot_id, service)
                    if name is not None:
                        await self.docker('rm', '-f', name, timeout=30)
                except ValueError:
                    # Removal must not fail on a machine where Docker is unreachable;
                    # the dot is archived either way and an operator can clean up later.
                    self.store.event('dot.teardown_failed', '이 Dot의 컨테이너를 정리하지 못했습니다',
                                     None, {'dot_id': dot_id, 'service': service})
        archived = self.store.archive_conversations(dot_id)
        self.set_status(dot_id, 'ARCHIVED')
        # Profile and endpoint settings are kept so an archived dot's conversations stay
        # readable and the removal remains reversible by an operator.
        self.store.event('dot.removed', profile['name'] + ' 닷을 삭제했습니다', None,
                         {'dot_id': dot_id, 'archived_conversations': archived})
        return {'id': dot_id, 'name': profile['name'], 'archived_conversations': archived}

    def touch(self, dot_id):
        self.store.touch_dot(dot_id)

    def activity(self, limit=40, dot_id=None):
        """Recent dot work, newest first, for the dot panel's activity section."""
        from .store import Conversation as ConversationRow
        with self.store.session() as db:
            query = select(Run, ConversationRow.dot_id).join(
                ConversationRow, ConversationRow.id == Run.conversation_id)
            if dot_id:
                query = query.where(ConversationRow.dot_id == dot_id)
            rows = list(db.execute(query.order_by(Run.created_at.desc()).limit(limit)))
            names = {dot.id: dot.name for dot in db.scalars(select(Dot))}
        return [{'id': run.id, 'conversation_id': run.conversation_id, 'dot_id': owner,
                 'dot_name': names.get(owner, ''), 'status': run.status, 'created_at': run.created_at,
                 'finished_at': run.finished_at, 'error': run.error} for run, owner in rows]

    async def environments(self):
        """Every dot's computer with live reachability, for the settings surface."""
        result = []
        for profile in self.listing():
            entry = {'dot_id': profile['id'], 'dot_name': profile['name'], 'computer_id': profile['computer_id'],
                     'dot_status': profile['status'], 'last_active_at': profile['last_active_at'],
                     'connected': False, 'owner': None, 'epoch': None, 'width': None, 'height': None}
            try:
                runtime = await self.get(profile['id'])
                state = await runtime.desktop.get('/health')
                entry.update({'connected': True, 'owner': state.get('owner'), 'epoch': state.get('epoch'),
                              'width': state.get('width'), 'height': state.get('height')})
            except (ValueError, httpx.HTTPError, KeyError):
                pass
            result.append(entry)
        return result

    # -- docker ------------------------------------------------------------

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
    async def docker(*args, timeout=45):
        try:
            proc = await asyncio.create_subprocess_exec('docker', *args,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        except FileNotFoundError as exc:
            raise ValueError('Dot 컴퓨터를 만들려면 서버에 Docker가 필요합니다.') from exc
        try:
            out, _ = await asyncio.wait_for(proc.communicate(), timeout)
        except TimeoutError:
            proc.kill()
            await proc.wait()
            raise ValueError('컴퓨터 준비 시간이 초과되었습니다. Docker 상태를 확인하세요.')
        if proc.returncode:
            raise ValueError('컴퓨터를 준비하지 못했습니다. Docker 실행 상태와 여유 공간을 확인하세요.')
        return out.decode().strip()

    async def find_container(self, dot_id, service):
        """Locate a dot's container by labels instead of guessing a container name."""
        args = ['ps', '-aq',
                '--filter', 'label=com.docker.compose.project=' + self.config.compose_project,
                '--filter', 'label=com.docker.compose.service=' + service]
        # Provisioned dots carry an explicit dot label; dot-1 is the base Compose service.
        if dot_id != 'dot-1':
            args += ['--filter', 'label=ohmydots.dot=' + dot_id]
        # A lookup must fail fast: an unreachable Docker daemon should not block a
        # user-initiated delete or reboot for the full container-creation budget.
        ids = (await self.docker(*args, timeout=10)).splitlines()
        return ids[0] if len(ids) == 1 else None

    async def wait_health(self, endpoints, attempts=30):
        async with httpx.AsyncClient(timeout=3) as client:
            for _ in range(attempts):
                try:
                    response = await client.get(endpoints['computer_url'] + '/health',
                        headers={'Authorization': 'Bearer ' + self.config.computer_token})
                    response.raise_for_status()
                    shell = await client.get(endpoints['shell_url'] + '/health',
                        headers={'Authorization': 'Bearer ' + self.config.shell_token})
                    shell.raise_for_status()
                    return True
                except (httpx.HTTPError, KeyError):
                    await asyncio.sleep(1)
        return False

    async def provision(self, dot_id):
        # Clone deployment resource/network settings, never mount the Docker socket in an agent.
        created = []
        endpoints = {}
        try:
            for service, token, port in [('computer', self.config.computer_token, 8765),
                                          ('shell', self.config.shell_token, 8766)]:
                ids = (await self.docker('ps', '-q', '--filter', 'label=com.docker.compose.project=' + self.config.compose_project,
                         '--filter', 'label=com.docker.compose.service=' + service)).splitlines()
                if len(ids) != 1:
                    raise ValueError('기본 Dot 컴퓨터 배포를 찾을 수 없습니다.')
                base = json.loads(await self.docker('inspect', ids[0]))[0]
                host = base['HostConfig']
                networks = list(base['NetworkSettings']['Networks'])
                prefix = self.config.compose_project
                name = prefix + '-' + dot_id + '-' + service
                args = ['create', '--name', name, '--label', 'ohmydots.dot=' + dot_id,
                        '--label', 'ohmydots.project=' + prefix,
                        '--restart', 'unless-stopped', '--network', networks[0],
                        '-e', service.upper() + '_TOKEN=' + token,
                        '-p', '127.0.0.1::' + str(port),
                        '--mount', 'type=volume,source=' + prefix + '-' + dot_id + '-artifacts,target=/workspace/artifacts',
                        '--cap-drop', 'ALL']
                if service == 'computer':
                    args += ['-p', '127.0.0.1::6080', '--mount',
                             'type=volume,source=' + prefix + '-' + dot_id + '-home,target=/home/dot']
                else:
                    args += ['--mount', 'type=volume,source=' + prefix + '-' + dot_id + '-tools,target=/workspace/.tools']
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
            if await self.wait_health(endpoints):
                return endpoints
            raise ValueError('새 컴퓨터가 아직 준비되지 않았습니다.')
        except BaseException:
            for name in created:
                await self.docker('rm', '-f', name)
            raise

    async def container_endpoints(self, dot_id):
        """Refresh ephemeral published ports after Docker/host restarts."""
        endpoints = {}
        for service, port in [('computer', '8765/tcp'), ('shell', '8766/tcp')]:
            name = await self.find_container(dot_id, service)
            if name is None:
                raise ValueError('Computer identity mismatch')
            row = json.loads(await self.docker('inspect', name))[0]
            labels = row['Config'].get('Labels') or {}
            if dot_id != 'dot-1' and (labels.get('ohmydots.project') != self.config.compose_project
                                      or labels.get('ohmydots.dot') != dot_id):
                raise ValueError('Computer identity mismatch')
            ports = row['NetworkSettings']['Ports']
            endpoints[service + '_url'] = 'http://127.0.0.1:' + ports[port][0]['HostPort']
            if service == 'computer':
                endpoints['vnc_url'] = 'ws://127.0.0.1:' + ports['6080/tcp'][0]['HostPort']
        return endpoints


__all__ = ['AVATARS', 'COLORS', 'STATUSES', 'BLOCKING_STATUSES', 'LastDotError', 'DotComputers']
