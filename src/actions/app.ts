import { ipc } from "@/ipc/manager";

export function getPlatform() {
  console.log("[Debug][Platform] request:getPlatform");
  return ipc.client.app.currentPlatfom();
}

export function getAppVersion() {
  console.log("[Debug][Platform] request:getAppVersion");
  return ipc.client.app.appVersion();
}
