import { notarize } from "@electron/notarize";

export default async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") return;
  if (!process.env.APPLE_ID || !process.env.APPLE_ID_PASSWORD) {
    console.log("Skipping notarization — APPLE_ID not set");
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  await notarize({
    appBundleId: "com.anthropic.claude-workbench",
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });
}
