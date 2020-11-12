/**
 * WordPress dependencies
 */
import {
	PostTitle,
	VisualEditorGlobalKeyboardShortcuts,
} from '@wordpress/editor';
import {
	WritingFlow,
	Typewriter,
	ObserveTyping,
	BlockList,
	CopyHandler,
	BlockSelectionClearer,
	MultiSelectScrollIntoView,
	__experimentalBlockSettingsMenuFirstItem,
	__experimentalUseResizeCanvas as useResizeCanvas,
} from '@wordpress/block-editor';
import { Popover, DropZoneProvider } from '@wordpress/components';
import { useState, useEffect, createPortal } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

/**
 * Internal dependencies
 */
import BlockInspectorButton from './block-inspector-button';
import { useSelect } from '@wordpress/data';

export const IFrame = ( { children, head, styles, ...props } ) => {
	const [ contentRef, setContentRef ] = useState();
	const doc = contentRef && contentRef.contentDocument;

	useEffect( () => {
		if ( doc ) {
			doc.body.className = 'editor-styles-wrapper';
			doc.body.style.margin = '0px';
			doc.head.innerHTML = head;
			doc.dir = document.dir;

			styles.forEach( ( { css } ) => {
				const styleEl = doc.createElement( 'style' );
				styleEl.innerHTML = css;
				doc.head.appendChild( styleEl );
			} );

			[ ...document.styleSheets ].reduce( ( acc, styleSheet ) => {
				try {
					const isMatch = [ ...styleSheet.cssRules ].find(
						( { selectorText } ) => {
							return (
								selectorText.indexOf(
									'.editor-styles-wrapper'
								) !== -1
							);
						}
					);

					if ( isMatch ) {
						const node = styleSheet.ownerNode;

						if ( ! doc.getElementById( node.id ) ) {
							doc.head.appendChild( node );
						}
					}
				} catch ( e ) {}

				return acc;
			}, [] );

			function bubbleEvent( event ) {
				const prototype = Object.getPrototypeOf( event );
				const constructorName = prototype.constructor.name;
				const Constructor = window[ constructorName ];

				const init = {};

				for ( const key in event ) {
					init[ key ] = event[ key ];
				}

				if ( event instanceof event.view.MouseEvent ) {
					const rect = contentRef.getBoundingClientRect();
					init.clientX += rect.left;
					init.clientY += rect.top;
				}

				const newEvent = new Constructor( event.type, init );
				const cancelled = ! contentRef.dispatchEvent( newEvent );

				if ( cancelled ) {
					event.preventDefault();
				}
			}

			const eventTypes = [ 'keydown', 'keypress', 'dragover' ];

			eventTypes.forEach( ( name ) => {
				doc.addEventListener( name, bubbleEvent );
			} );

			return () => {
				eventTypes.forEach( ( name ) => {
					doc.removeEventListener( name, bubbleEvent );
				} );
			};
		}
	}, [ doc ] );

	return (
		<iframe
			{ ...props }
			ref={ setContentRef }
			title={ __( 'Editor canvas' ) }
			name="editor-canvas"
		>
			{ doc && createPortal( children, doc.body ) }
		</iframe>
	);
};

function VisualEditor( { settings } ) {
	const deviceType = useSelect( ( select ) => {
		return select( 'core/edit-post' ).__experimentalGetPreviewDeviceType();
	}, [] );

	const inlineStyles = useResizeCanvas( deviceType );

	return (
		<>
			<VisualEditorGlobalKeyboardShortcuts />
			<Popover.Slot name="block-toolbar" />
			<IFrame
				className="edit-post-visual-editor"
				style={ inlineStyles }
				head={ window.__editorStyles.html }
				styles={ settings.styles }
			>
				<BlockSelectionClearer>
					<DropZoneProvider>
						<MultiSelectScrollIntoView />
						<Typewriter>
							<CopyHandler>
								<WritingFlow>
									<ObserveTyping>
										<CopyHandler>
											<div className="edit-post-visual-editor__post-title-wrapper">
												<PostTitle />
											</div>
											<BlockList />
										</CopyHandler>
									</ObserveTyping>
								</WritingFlow>
							</CopyHandler>
						</Typewriter>
						<__experimentalBlockSettingsMenuFirstItem>
							{ ( { onClose } ) => (
								<BlockInspectorButton onClick={ onClose } />
							) }
						</__experimentalBlockSettingsMenuFirstItem>
					</DropZoneProvider>
				</BlockSelectionClearer>
			</IFrame>
		</>
	);
}

export default VisualEditor;
