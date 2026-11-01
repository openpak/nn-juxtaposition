import { encodeBmp1, toBase64 } from '@/js/bmp';

/* The drawing pad on the new post page: a 320x120 black and white canvas, the same size and ink as
 * the Wii U and 3DS drawing screens. Pointer events cover mouse, touch and pen. */

const W = 320;
const H = 120;
const MAX_UNDO = 40;

type Pen = { size: 'small' | 'large' | 'eraser' };

function stamp(ctx: CanvasRenderingContext2D, x: number, y: number, pen: Pen): void {
	ctx.fillStyle = pen.size === 'eraser' ? '#fff' : '#000';
	if (pen.size === 'small') {
		// the console's second pen: a plus of three pixels
		ctx.fillRect(x - 1, y, 3, 1);
		ctx.fillRect(x, y - 1, 1, 3);
	} else {
		// a round blob, 9 pixels across
		ctx.fillRect(x - 3, y - 3, 7, 7);
		ctx.fillRect(x - 4, y - 1, 9, 3);
		ctx.fillRect(x - 1, y - 4, 3, 9);
	}
}

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, pen: Pen): void {
	const dx = Math.abs(x1 - x0);
	const dy = Math.abs(y1 - y0);
	const sx = x0 < x1 ? 1 : -1;
	const sy = y0 < y1 ? 1 : -1;
	let err = dx - dy;
	for (;;) {
		stamp(ctx, x0, y0, pen);
		if (x0 === x1 && y0 === y1) {
			return;
		}
		const e2 = err * 2;
		if (e2 > -dy) {
			err -= dy;
			x0 += sx;
		}
		if (e2 < dx) {
			err += dx;
			y0 += sy;
		}
	}
}

function readInk(ctx: CanvasRenderingContext2D): Uint8Array {
	const data = ctx.getImageData(0, 0, W, H).data;
	const ink = new Uint8Array(W * H);
	for (let i = 0; i < W * H; i++) {
		ink[i] = data[i * 4]! < 128 ? 1 : 0;
	}
	return ink;
}

export function initDrawing(form: HTMLFormElement): void {
	const canvas = form.querySelector<HTMLCanvasElement>('canvas[data-drawing-canvas]');
	const typeInput = form.querySelector<HTMLInputElement>('input[name="_post_type"]');
	const paintingInput = form.querySelector<HTMLInputElement>('input[name="painting"]');
	const message = form.querySelector<HTMLElement>('[data-drawing-message]');
	const ctx = canvas?.getContext('2d', { willReadFrequently: true });
	if (!canvas || !ctx || !typeInput || !paintingInput) {
		return;
	}

	const clear = (): void => {
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, W, H);
	};
	clear();

	let pen: Pen = { size: 'small' };
	const undoStack: ImageData[] = [];
	const saveUndo = (): void => {
		undoStack.push(ctx.getImageData(0, 0, W, H));
		if (undoStack.length > MAX_UNDO) {
			undoStack.shift();
		}
	};

	// --- tabs ---------------------------------------------------------------------------------
	const tabs = form.querySelectorAll<HTMLElement>('[data-tab]');
	const panes = form.querySelectorAll<HTMLElement>('[data-pane]');
	const show = (name: string): void => {
		typeInput.value = name;
		tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
		panes.forEach((p) => {
			p.hidden = p.dataset.pane !== name;
		});
		if (message) {
			message.hidden = true;
		}
	};
	tabs.forEach((t) => {
		t.hidden = false; // the tabs only make sense with scripting on
		t.addEventListener('click', () => show(t.dataset.tab ?? 'body'));
	});
	show('body');

	// --- tools --------------------------------------------------------------------------------
	const tools = form.querySelectorAll<HTMLElement>('[data-tool]');
	const selectTool = (name: Pen['size']): void => {
		pen = { size: name };
		tools.forEach(t => t.setAttribute('aria-pressed', String(t.dataset.tool === name)));
	};
	tools.forEach(t => t.addEventListener('click', () => selectTool(t.dataset.tool as Pen['size'])));
	selectTool('small');

	form.querySelector('[data-action="undo"]')?.addEventListener('click', () => {
		const last = undoStack.pop();
		if (last) {
			ctx.putImageData(last, 0, 0);
		}
	});
	form.querySelector('[data-action="clear"]')?.addEventListener('click', () => {
		saveUndo();
		clear();
	});

	// --- drawing ------------------------------------------------------------------------------
	let last: { x: number; y: number } | null = null;
	const at = (e: PointerEvent): { x: number; y: number } => {
		const r = canvas.getBoundingClientRect();
		return {
			x: Math.max(0, Math.min(W - 1, Math.floor((e.clientX - r.left) * W / r.width))),
			y: Math.max(0, Math.min(H - 1, Math.floor((e.clientY - r.top) * H / r.height)))
		};
	};
	canvas.addEventListener('pointerdown', (e) => {
		e.preventDefault();
		canvas.setPointerCapture(e.pointerId);
		saveUndo();
		last = at(e);
		stamp(ctx, last.x, last.y, pen);
	});
	canvas.addEventListener('pointermove', (e) => {
		if (!last) {
			return;
		}
		const p = at(e);
		line(ctx, last.x, last.y, p.x, p.y, pen);
		last = p;
	});
	const end = (): void => {
		last = null;
	};
	canvas.addEventListener('pointerup', end);
	canvas.addEventListener('pointercancel', end);

	// --- submit -------------------------------------------------------------------------------
	form.addEventListener('submit', (e) => {
		if (typeInput.value !== 'painting') {
			paintingInput.value = '';
			return;
		}
		const ink = readInk(ctx);
		if (!ink.includes(1)) {
			e.preventDefault();
			if (message) {
				message.hidden = false;
			}
			return;
		}
		paintingInput.value = toBase64(encodeBmp1(W, H, ink));
	});
}

document.querySelectorAll<HTMLFormElement>('form[data-drawing-form]').forEach(initDrawing);
