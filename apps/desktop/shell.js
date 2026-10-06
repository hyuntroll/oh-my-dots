document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => window.desktop.action(button.dataset.action)));
window.desktop.status(state => {
  const offline = state === 'offline';
  document.querySelector('main').hidden = state === 'ready';
  document.querySelector('.spinner').hidden = offline;
  document.querySelector('#retry').hidden = !offline;
  document.querySelector('#message').textContent = offline ? '웹 서버에 연결할 수 없습니다' : 'OhMyDots를 여는 중';
  document.querySelector('#detail').textContent = offline ? 'localhost:3080을 실행한 뒤 다시 연결해 주세요.' : '컴퓨터와 대화에 연결하고 있습니다.';
});
