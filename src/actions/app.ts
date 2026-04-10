import { ipc } from "@/ipc/manager";
import { logger } from "@/utils/logger";

export function getPlatform() {
  logger.debug("[Platform] request:getPlatform");
  return ipc.client.app.currentPlatfom();
}

export function getAppVersion() {
  logger.debug("[Platform] request:getAppVersion");
  return ipc.client.app.appVersion();
}
