export async function minimizeWindow() {
  await window.api.minimizeWindow();
}
export async function maximizeWindow() {
  await window.api.toggleMaximizeWindow();
}
export async function closeWindow() {
  await window.api.closeWindow();
}
