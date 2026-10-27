import { it } from 'vitest';
import { toyHash } from '#lib/engine/worlds/web.ts';
it('x', () => {
	for (const p of ['inkwell-mina', 'inkwell-ravi', 'hunter22', 'noodles4ever']) console.log(p, toyHash(p));
});
