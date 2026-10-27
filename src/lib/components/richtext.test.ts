import { describe, expect, it } from 'vitest';
import { escapeHtml, markdownLite } from './richtext.ts';

/** Every tag the renderer may produce. Anything else in the output means markup got through. */
const ALLOWED_TAG = /^<\/?(p|br|code|pre|strong)>$/;

function tagsIn(html: string): string[] {
	return html.match(/<[^>]*>/g) ?? [];
}

const NASTY = [
	'<script>alert(1)</script>',
	'<img src=x onerror="alert(1)">',
	'`<svg onload=alert(1)>`',
	'**<b onmouseover=alert(1)>hi</b>**',
	'```js\n</code></pre><script>alert(1)</script>\n```',
	'"><iframe src=javascript:alert(1)>',
	"' onfocus='alert(1)",
	'&lt;script&gt; already escaped',
	'**`<a href="javascript:alert(1)">x</a>`**'
];

describe('escapeHtml', () => {
	it('escapes the five HTML-significant characters', () => {
		expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
			'&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
		);
	});
});

describe('markdownLite', () => {
	it('never lets markup from the text through, block or inline', () => {
		for (const text of NASTY) {
			for (const inline of [false, true]) {
				const html = markdownLite(text, { inline });
				for (const tag of tagsIn(html)) expect(tag, `${text} → ${html}`).toMatch(ALLOWED_TAG);
				expect(html).not.toMatch(/<(script|img|svg|iframe|a|b)\b/i);
			}
		}
	});

	it('shows learner output in a check message as text', () => {
		const html = markdownLite('Line 1 should be `hi`, but it was `<script>steal()</script>`.', {
			inline: true
		});
		expect(html).toBe(
			'Line 1 should be <code>hi</code>, but it was <code>&lt;script&gt;steal()&lt;/script&gt;</code>.'
		);
	});

	it('escapes a learner-typed identifier inside an error message', () => {
		expect(markdownLite('I don’t know `x<img src=x onerror=alert(1)>` yet.')).toBe(
			'<p>I don’t know <code>x&lt;img src=x onerror=alert(1)&gt;</code> yet.</p>'
		);
	});

	it('double-escapes text that already looks escaped', () => {
		expect(markdownLite('&lt;b&gt;', { inline: true })).toBe('&amp;lt;b&amp;gt;');
	});

	it('still renders the supported formatting', () => {
		expect(markdownLite('Use **bold** and `move()`.\nNext line\n\nNew para')).toBe(
			'<p>Use <strong>bold</strong> and <code>move()</code>.<br>Next line</p><p>New para</p>'
		);
		expect(markdownLite('```js\nif (a < b) say("hi")\n```')).toBe(
			'<pre><code>if (a &lt; b) say(&quot;hi&quot;)</code></pre>'
		);
	});
});
