"use client";

const SCOPE = "https://www.googleapis.com/auth/drive.file";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google?: any;
    gapi?: any;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Google. Check your connection."));
    document.head.appendChild(s);
  });
}

export function pickerConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID &&
    process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY &&
    process.env.NEXT_PUBLIC_GOOGLE_APP_ID
  );
}

function getToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (resp: any) =>
        resp.access_token ? resolve(resp.access_token) : reject(new Error("Google sign-in was cancelled.")),
      error_callback: () => reject(new Error("Google sign-in was cancelled.")),
    });
    client.requestAccessToken();
  });
}

/** Opens Google sign-in, then the Picker. Resolves null when the person closes the Picker without choosing. */
export async function pickDriveFile(): Promise<{ id: string; accessToken: string } | null> {
  await Promise.all([
    loadScript("https://accounts.google.com/gsi/client"),
    loadScript("https://apis.google.com/js/api.js"),
  ]);
  await new Promise<void>((resolve) => window.gapi.load("picker", () => resolve()));
  const accessToken = await getToken();
  return new Promise((resolve) => {
    const g = window.google.picker;
    const view = new g.DocsView().setMimeTypes(
      "application/vnd.google-apps.document,application/vnd.google-apps.presentation",
    );
    const picker = new g.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY)
      .setAppId(process.env.NEXT_PUBLIC_GOOGLE_APP_ID)
      .setCallback((data: any) => {
        if (data.action === g.Action.PICKED) resolve({ id: data.docs[0].id, accessToken });
        else if (data.action === g.Action.CANCEL) resolve(null);
      })
      .build();
    picker.setVisible(true);
  });
}
