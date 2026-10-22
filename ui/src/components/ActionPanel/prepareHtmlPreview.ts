import request from "@/utils/request";

/** An iframe cannot run the application's 401/refresh interceptor. Renew its
 * HttpOnly file cookie before navigation, without putting a token in its URL.
 */
export async function prepareHtmlPreview(url?: string, signal?: AbortSignal) {
  if (!url || typeof window === "undefined") return;
  const page = new URL(window.location.href);
  const target = new URL(url, page);
  if (target.origin !== page.origin || !target.pathname.startsWith("/tool/v1/file_tool/preview/")) return;
  const html = await readHtmlSource(target.href, signal);
  return isolateHtmlSource(html);
}

export async function readHtmlSource(url: string, signal?: AbortSignal) {
  const target = new URL(url, window.location.href);
  if (target.origin !== new URL(window.location.href).origin || !target.pathname.startsWith("/tool/v1/file_tool/preview/")) throw new Error("不是本项目的 HTML 文件");
  await request.get("/api/v1/admin/admin-user/me", { signal });
  const response = await fetch(target.href, { credentials: "same-origin", signal, redirect: "error" });
  if (!response.ok) throw new Error(`HTML preview HTTP ${response.status}`);
  if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
    throw new Error("HTML preview returned a non-HTML response");
  }
  return response.text();
}

export function isolateHtmlSource(html: string) {
  // srcDoc avoids another opaque-origin navigation and lets us handle HTTP
  // failures. Keep the response's execution restrictions inside the document;
  // sandbox remains enforced by the parent iframe attribute (not CSP meta).
  const policy = "default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; style-src 'unsafe-inline' https:; img-src https: data: blob:; font-src https: data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  return `<!doctype html>${meta}${html.replace(/^\s*<!doctype[^>]*>/i, "")}`;
}
