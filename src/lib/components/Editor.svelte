<!--
  A calm, beginner-friendly CodeMirror 6 editor.
  - No autocomplete popups, linting squiggles, folding or search panels: fewer surprises.
  - Bracket matching + auto-closing brackets/quotes, two-space Tab, big touch-friendly text.
  - `value` is bindable. `run` is called on Ctrl/Cmd+Enter. `errorLine` highlights a line.
  - `language` switches the highlighter: 'js' (default) or 'sql'.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Compartment,
		EditorState,
		StateEffect,
		StateField,
		type Extension
	} from '@codemirror/state';
	import {
		EditorView,
		Decoration,
		type DecorationSet,
		keymap,
		lineNumbers,
		highlightActiveLine,
		highlightActiveLineGutter,
		drawSelection,
		placeholder as cmPlaceholder
	} from '@codemirror/view';
	import {
		defaultKeymap,
		history,
		historyKeymap,
		indentLess,
		indentMore
	} from '@codemirror/commands';
	import {
		bracketMatching,
		indentOnInput,
		indentUnit,
		syntaxHighlighting,
		HighlightStyle
	} from '@codemirror/language';
	import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
	import { javascript } from '@codemirror/lang-javascript';
	import { tags as t } from '@lezer/highlight';
	import { sqlLanguage } from './sql-lang.ts';

	let {
		value = $bindable(''),
		readonly = false,
		run,
		errorLine = null,
		label = 'Code editor',
		placeholder = '',
		minLines = 6,
		language = 'js'
	}: {
		value?: string;
		readonly?: boolean;
		run?: () => void;
		errorLine?: number | null;
		label?: string;
		placeholder?: string;
		minLines?: number;
		language?: 'js' | 'sql';
	} = $props();

	const languageSlot = new Compartment();
	const languageExtension = (lang: 'js' | 'sql'): Extension =>
		lang === 'sql' ? sqlLanguage : javascript();

	let host: HTMLDivElement;
	let view = $state<EditorView | undefined>();

	const setErrorLine = StateEffect.define<number | null>();
	const errorLineField = StateField.define<DecorationSet>({
		create: () => Decoration.none,
		update(deco, tr) {
			deco = deco.map(tr.changes);
			for (const e of tr.effects) {
				if (e.is(setErrorLine)) {
					const n = e.value;
					if (n && n >= 1 && n <= tr.state.doc.lines) {
						const line = tr.state.doc.line(n);
						deco = Decoration.set([Decoration.line({ class: 'cm-errorLine' }).range(line.from)]);
					} else {
						deco = Decoration.none;
					}
				}
			}
			// Typing clears the marker: the learner is already fixing it.
			if (tr.docChanged) deco = Decoration.none;
			return deco;
		},
		provide: (f) => EditorView.decorations.from(f)
	});

	const calmHighlight = HighlightStyle.define([
		{
			tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword],
			color: '#a43f7a',
			fontWeight: '600'
		},
		{ tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#1f6fb2' },
		{ tag: [t.number, t.bool, t.null, t.atom], color: '#b4590e' },
		{ tag: [t.string, t.special(t.string)], color: '#2f8a4f' },
		{ tag: t.comment, color: '#9a9088', fontStyle: 'italic' },
		{ tag: [t.operator, t.punctuation, t.bracket], color: '#6f665d' },
		{ tag: t.definition(t.variableName), color: '#6b3fa0' },
		{ tag: t.variableName, color: '#2b2521' },
		{ tag: t.propertyName, color: '#2b5f8a' }
	]);

	const calmTheme = EditorView.theme(
		{
			'&': {
				fontSize: '17px',
				backgroundColor: '#fffdf9',
				color: '#2b2521',
				borderRadius: '1rem'
			},
			'&.cm-focused': { outline: 'none' },
			'.cm-scroller': {
				fontFamily: 'var(--font-mono)',
				lineHeight: '1.65',
				padding: '0.5rem 0'
			},
			'.cm-content': { caretColor: 'var(--accent)', padding: '0.25rem 0' },
			'.cm-line': { padding: '0 1rem 0 0.75rem' },
			'.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2.5px' },
			'.cm-gutters': {
				backgroundColor: 'transparent',
				color: '#c2b8ad',
				border: 'none',
				paddingLeft: '0.5rem'
			},
			'.cm-lineNumbers .cm-gutterElement': { minWidth: '1.6rem', textAlign: 'right' },
			'.cm-activeLine': { backgroundColor: 'color-mix(in oklab, var(--accent) 6%, transparent)' },
			'.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#7f756c' },
			'&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection':
				{ backgroundColor: 'color-mix(in oklab, var(--accent) 24%, white) !important' },
			'&.cm-focused .cm-matchingBracket': {
				backgroundColor: 'color-mix(in oklab, var(--accent) 22%, transparent)',
				outline: '1px solid color-mix(in oklab, var(--accent) 50%, transparent)',
				borderRadius: '3px'
			},
			'.cm-errorLine': { backgroundColor: '#fbe4dc' },
			'.cm-placeholder': { color: '#b3a99f', fontStyle: 'italic' }
		},
		{ dark: false }
	);

	function insertTwoSpaces(v: EditorView): boolean {
		if (v.state.readOnly) return false;
		const sel = v.state.selection.main;
		if (!sel.empty && v.state.doc.lineAt(sel.from).number !== v.state.doc.lineAt(sel.to).number) {
			return indentMore(v);
		}
		v.dispatch(v.state.replaceSelection('  '), { scrollIntoView: true, userEvent: 'input' });
		return true;
	}

	function extensions(): Extension[] {
		return [
			lineNumbers(),
			highlightActiveLineGutter(),
			highlightActiveLine(),
			history(),
			drawSelection(),
			indentOnInput(),
			bracketMatching(),
			closeBrackets(),
			indentUnit.of('  '),
			EditorState.tabSize.of(2),
			languageSlot.of(languageExtension(language)),
			syntaxHighlighting(calmHighlight),
			calmTheme,
			errorLineField,
			EditorView.lineWrapping,
			EditorState.readOnly.of(readonly),
			EditorView.editable.of(!readonly),
			EditorView.contentAttributes.of({
				'aria-label': readonly
					? `${label} (read only)`
					: `${label}. Press Escape then Tab to leave the editor.`,
				autocapitalize: 'off',
				autocorrect: 'off',
				spellcheck: 'false'
			}),
			...(placeholder ? [cmPlaceholder(placeholder)] : []),
			keymap.of([
				{
					key: 'Mod-Enter',
					run: () => {
						run?.();
						return true;
					},
					preventDefault: true
				},
				{ key: 'Tab', run: insertTwoSpaces, shift: indentLess },
				...closeBracketsKeymap,
				...defaultKeymap,
				...historyKeymap
			]),
			EditorView.updateListener.of((u) => {
				if (u.docChanged) {
					const next = u.state.doc.toString();
					if (next !== value) value = next;
				}
			})
		];
	}

	onMount(() => {
		view = new EditorView({
			parent: host,
			state: EditorState.create({ doc: value, extensions: extensions() })
		});
		return () => view?.destroy();
	});

	// Outside changes to `value` (e.g. Reset) flow into the editor.
	$effect(() => {
		const v = value;
		if (view && v !== view.state.doc.toString()) {
			view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } });
		}
	});

	$effect(() => {
		const lang = language;
		view?.dispatch({ effects: languageSlot.reconfigure(languageExtension(lang)) });
	});

	$effect(() => {
		const n = errorLine;
		view?.dispatch({ effects: setErrorLine.of(n) });
	});

	export function focus() {
		view?.focus();
	}
</script>

<div
	class="editor-host"
	class:readonly
	style:--min-lines={minLines}
	bind:this={host}
	data-testid="code-editor"
	data-language={language}
>
	{#if !view}
		<!-- Shown until CodeMirror mounts (and without JS) so the code is never invisible. -->
		<pre class="fallback">{value}</pre>
	{/if}
</div>

<style>
	.editor-host {
		border: 1.5px solid var(--color-line);
		border-radius: 1rem;
		background: #fffdf9;
		overflow: hidden;
		transition:
			border-color 120ms ease,
			box-shadow 120ms ease;
	}
	.editor-host:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 4px color-mix(in oklab, var(--accent) 16%, transparent);
	}
	.editor-host.readonly {
		background: #fbf8f3;
	}
	.editor-host :global(.cm-editor) {
		min-height: calc(var(--min-lines) * 1.65 * 17px + 1.5rem);
	}
	.fallback {
		margin: 0;
		padding: 0.75rem 1rem 0.75rem 2.9rem;
		font-family: var(--font-mono);
		font-size: 17px;
		line-height: 1.65;
		white-space: pre-wrap;
		min-height: calc(var(--min-lines) * 1.65 * 17px + 1.5rem);
	}
	@media (max-width: 640px) {
		.editor-host :global(.cm-editor) {
			font-size: 16px;
		}
	}
</style>
