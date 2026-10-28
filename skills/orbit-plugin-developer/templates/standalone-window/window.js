document.getElementById('btnClose').addEventListener('click', () => {
  window.myToolWin.close();
});

document.getElementById('btnAction').addEventListener('click', () => {
  alert('浮窗内部交互响应成功！');
});
