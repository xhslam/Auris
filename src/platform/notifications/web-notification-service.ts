export type WebNotificationService = {
  kind: "web";
  notifyTrainingReady: (title: string) => Promise<void>;
};

export function createWebNotificationService(): WebNotificationService {
  return {
    kind: "web",
    async notifyTrainingReady(title: string) {
      if (typeof window === "undefined" || !("Notification" in window)) {
        return;
      }

      if (window.Notification.permission === "granted") {
        new window.Notification("Training is ready", {
          body: `You can start shadowing: ${title}`,
        });
        return;
      }

      if (window.Notification.permission !== "default") {
        return;
      }

      const permission = await window.Notification.requestPermission();

      if (permission === "granted") {
        new window.Notification("Training is ready", {
          body: `You can start shadowing: ${title}`,
        });
      }
    },
  };
}
