/** Safe markdown → HTML for notes and comments (REQ-TASK-02: rendered safely,
 * no XSS). marked for parsing, DOMPurify to sanitize. Allows images/media so
 * comments can embed multimedia. */
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ breaks: true, gfm: true });

// Allow <video>/<audio>/<source> so markdown comments can embed media, and make
// links open safely in a new tab. NOTE: <iframe> is deliberately NOT allowed —
// permitting arbitrary iframes lets user/AI-authored notes embed a full-page
// attacker origin (phishing/clickjacking) inside the trusted app origin.
const ALLOWED_TAGS = ["video", "audio", "source"];
const ALLOWED_ATTR = ["controls", "src", "type", "poster", "loop", "muted"];

if (typeof window !== "undefined") {
  DOMPurify.addHook("afterSanitizeAttributes", (node: any) => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer nofollow");
    }
  });
}

export function renderMarkdown(src: string): string {
  const raw = marked.parse(src || "", { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    ADD_TAGS: ALLOWED_TAGS,
    ADD_ATTR: ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data:image\/(?:png|jpe?g|gif|webp|svg\+xml)):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}
