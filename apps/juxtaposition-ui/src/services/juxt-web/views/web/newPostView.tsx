import { T } from '@/services/juxt-web/views/common/components/T';
import { WebRoot, WebWrapper } from '@/services/juxt-web/views/web/root';
import type { ReactNode } from 'react';
import type { Community, CommunityShotMode } from '@/api/generated';

export type NewPostViewProps = {
	id: string;
	name: string; // Username or community name
	url: string;
	show: string;
	// must provide messagePid OR community
	messagePid?: number;
	community?: Community;
	shotMode: CommunityShotMode;

	// Error feedback
	errorText?: string;

	/** Supervised account: may read, may not post */
	readOnly?: boolean;
};

export function WebNewPostView(props: NewPostViewProps): ReactNode {
	return (
		<div id="add-post-page" className="add-post-page web-post-form">
			<form method="post" action={props.url} id="posts-form" data-drawing-form>
				{props.errorText ? <p className="form-error" role="alert">{props.errorText}</p> : null}
				<input type="hidden" name="community_id" value={props.id} />
				<input type="hidden" name="feeling_id" value="0" />
				<input type="hidden" name="_post_type" value="body" />
				<input type="hidden" name="painting" value="" />
				<input type="hidden" name="bmp" value="true" />
				<input id="message_to_pid" type="hidden" name="message_to_pid" value={props.messagePid ?? undefined} />

				<div className="post-tabs" role="tablist">
					<button type="button" role="tab" data-tab="body" aria-selected="true" hidden><T k="new_post.tab_text" /></button>
					<button type="button" role="tab" data-tab="painting" aria-selected="false" hidden><T k="new_post.tab_drawing" /></button>
				</div>

				<div data-pane="body">
					<textarea id="new-post-text" name="body" className="textarea-text" maxLength={280} placeholder={T.str('new_post.content_placeholder')}></textarea>
					<label className="checkbox-container spoiler-button">
						<T k="new_post.spoiler_label" />
						<input type="checkbox" id="spoiler" name="spoiler" value="true" />
						<span className="checkmark"></span>
					</label>
				</div>

				<div data-pane="painting" hidden>
					<p className="drawing-hint"><T k="new_post.drawing_label" /></p>
					<canvas data-drawing-canvas width={320} height={120} className="drawing-canvas"></canvas>
					<div className="drawing-tools">
						<button type="button" data-tool="small" aria-pressed="true"><T k="new_post.pen_small" /></button>
						<button type="button" data-tool="large" aria-pressed="false"><T k="new_post.pen_large" /></button>
						<button type="button" data-tool="eraser" aria-pressed="false"><T k="new_post.eraser" /></button>
						<button type="button" data-action="undo"><T k="new_post.undo" /></button>
						<button type="button" data-action="clear"><T k="new_post.clear" /></button>
					</div>
					<p className="form-error" data-drawing-message role="alert" hidden><T k="new_post.drawing_empty" /></p>
				</div>

				<div id="button-wrapper">
					<input type="submit" className="post-button fixed-bottom-button" value={T.str('new_post.submit')} />
				</div>
			</form>
			<script src="/assets/web/js/drawing.global.js" defer />
		</div>
	);
}

export function WebNewPostPage(props: NewPostViewProps): ReactNode {
	const content = props.readOnly
		? (
				<div className="read-only-note">
					<h3><T k="new_post.read_only_title" /></h3>
					<p><T k="new_post.read_only_text" /></p>
					<p><a href="/titles"><T k="new_post.back" /></a></p>
				</div>
			)
		: <WebNewPostView {... props} />;

	return (
		<WebRoot>
			<h2 id="title" className="page-header">
				<T k="new_post.post_to" values={{ user: props.name }} />
			</h2>
			<WebWrapper className="community-page-post-box">
				{content}
			</WebWrapper>
		</WebRoot>
	);
}
