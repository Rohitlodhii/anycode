import { os } from "@orpc/server";
import { ipcContext } from "../context";

// Create middleware function that defers context access until handler execution
const getMainWindowContext = () => {
  return os.middleware(({ next }) => {
    const window = ipcContext.mainWindow;
    if (!window) {
      throw new Error("Main window is not set in IPC context.");
    }
    return next({
      context: {
        window,
      },
    });
  });
};

export const minimizeWindow = os
  .use(getMainWindowContext())
  .handler(({ context }) => {
    const { window } = context;

    window.minimize();
  });

export const maximizeWindow = os
  .use(getMainWindowContext())
  .handler(({ context }) => {
    const { window } = context;

    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  });

export const closeWindow = os
  .use(getMainWindowContext())
  .handler(({ context }) => {
    const { window } = context;

    window.close();
  });
