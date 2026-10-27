/**
 * Markdown-lite → HTML for curriculum text. Supports exactly what the curriculum allows:
 * `code`, **bold**, line breaks, blank-line paragraphs, and fenced ```js blocks.
 * HTML in the source is always escaped first, so the output is safe for {@html}.
 */

export function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function inline(escaped: string): string {
	// Split on inline code first so we never bold inside code.
	return escaped
		.split(/(`[^`\n]+`)/g)
		.map((part) => {
			if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
				return `<code>${part.slice(1, -1)}</code>`;
			}
			return part.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
		})
		.join('');
}

export function markdownLite(text: string, opts: { inline?: boolean } = {}): string {
	const src = escapeHtml(text.replace(/\r\n?/g, '\n')).trim();
	if (opts.inline) return inline(src);

	const out: string[] = [];
	// Fenced blocks: ```js\n...\n``` (language tag optional)
	const fence = /```[a-zA-Z]*\n([\s\S]*?)\n?```/g;
	let last = 0;
	let m: RegExpExecArray | null;
	const pushProse = (chunk: string) => {
		for (const para of chunk.split(/\n{2,}/)) {
			const p = para.trim();
			if (p) out.push(`<p>${inline(p)}</p>`);
		}
	};
	while ((m = fence.exec(src))) {
		pushProse(src.slice(last, m.index));
		out.push(`<pre><code>${m[1].replace(/^\n+|\s+$/g, '')}</code></pre>`);
		last = m.index + m[0].length;
	}
	pushProse(src.slice(last));
	return out.join('');
}
