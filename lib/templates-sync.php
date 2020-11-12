<?php
/**
 * Block templates and template parts auto-draft synchronization utils.
 *
 * @package gutenberg
 */

/**
 * Creates a template (or template part depending on the post type)
 * auto-draft if it doesn't exist yet.
 *
 * @access private
 * @internal
 *
 * @param string $post_type Template post type.
 * @param string $slug      Template slug.
 * @param string $theme     Template theme.
 * @param string $content   Template content.
 */
function _gutenberg_create_auto_draft_for_template( $post_type, $slug, $theme, $content ) {
	// We check if an auto-draft was already created,
	// before running the REST API calls
	// because the site editor needs an existing auto-draft
	// for each theme template part to work properly.
	$template_query = new WP_Query(
		array(
			'post_type'      => $post_type,
			'post_status'    => array( 'publish', 'auto-draft' ),
			'title'          => $slug,
			'meta_key'       => 'theme',
			'meta_value'     => $theme,
			'posts_per_page' => 1,
			'no_found_rows'  => true,
		)
	);
	$post           = $template_query->have_posts() ? $template_query->next_post() : null;
	if ( ! $post ) {
		wp_insert_post(
			array(
				'post_content' => $content,
				'post_title'   => $slug,
				'post_status'  => 'auto-draft',
				'post_type'    => $post_type,
				'post_name'    => $slug,
			)
		);
	} elseif ( 'auto-draft' === $post->post_status && $content !== $post->post_content ) {
		// If the template already exists, but it was never changed by the user
		// and the template file content changed then update the content of auto-draft.
		$post->post_content = $content;
		wp_insert_post( $post );
	}
}

/**
 * Finds all nested template part file paths in a theme's directory.
 *
 * @access private
 *
 * @param string $base_directory The theme's file path.
 * @return array $path_list A list of paths to all template part files.
 */
function _gutenberg_get_template_paths( $base_directory ) {
	$path_list = array();
	if ( file_exists( $base_directory ) ) {
		$nested_files      = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $base_directory ) );
		$nested_html_files = new RegexIterator( $nested_files, '/^.+\.html$/i', RecursiveRegexIterator::GET_MATCH );
		foreach ( $nested_html_files as $path => $file ) {
			$path_list[] = $path;
		}
	}
	return $path_list;
}

/**
 * Create the template parts auto-drafts for the current theme.
 *
 * @access private
 * @internal
 *
 * @param string $template_type The template type (template or template-part).
 */
function _gutenberg_synchronize_theme_templates( $template_type ) {
	$template_post_types = array(
		'template'      => 'wp_template',
		'template-part' => 'wp_template_part',
	);
	$template_base_paths = array(
		'template'      => 'block-templates',
		'template-part' => 'block-template-parts',
	);

	// Get file paths for all theme supplied template.
	$template_files = _gutenberg_get_template_paths( get_stylesheet_directory() . '/' . $template_base_paths[ $template_type ] );
	if ( is_child_theme() ) {
		$template_files = array_merge( $template_files, _gutenberg_get_template_paths( get_template_directory() . '/' . $template_base_paths[ $template_type ] ) );
	}

	// Build and save each template part.
	foreach ( $template_files as $template_file ) {
		$content = file_get_contents( $template_file );
		$slug    = substr(
			$template_file,
			// Starting position of slug.
			strpos( $template_file, $template_base_paths[ $template_type ] . '/' ) + 1 + strlen( $template_base_paths[ $template_type ] ),
			// Subtract ending '.html'.
			-5
		);
		_gutenberg_create_auto_draft_for_template( $template_post_types[ $template_type ], $slug, wp_get_theme()->get_stylesheet(), $content );
	}
}

/**
 * Create the templates and template parts auto-drafts for the current theme.
 * If the current theme is a child theme then the parent theme is synchronized as well.
 * Runs only if current or parent theme was never loaded before or it is a newer version.
 *
 * To force synchronization on every load define BLOCK_THEME_DEV_MODE constant with true value.
 *
 * ```php
 * define( 'BLOCK_THEME_DEV_MODE', true );
 * ```
 */
function gutenberg_synchronize_theme_templates_on_version_change() {
	if ( defined( 'BLOCK_THEME_DEV_MODE' ) && BLOCK_THEME_DEV_MODE ) {
		_gutenberg_synchronize_theme_templates( 'template-part' );
		_gutenberg_synchronize_theme_templates( 'template' );
		return;
	}

	$create_auto_drafts = false;

	$theme             = wp_get_theme();
	$stylesheet        = $theme->get_stylesheet();
	$parent_theme      = $theme->parent();
	$parent_stylesheet = $parent_theme ? $parent_theme->get_stylesheet() : null;

	$last_auto_drafts_versions = get_option( 'gutenberg_last_template_auto_drafts_theme_versions', array() );
	if ( isset( $last_auto_drafts_versions[ $stylesheet ] ) ) {
		$last_version = $last_auto_drafts_versions[ $stylesheet ];
		if ( version_compare( $theme->version, $last_version, '>' ) ) {
			$create_auto_drafts = true;
		}
	} else {
		$create_auto_drafts = true;
	}

	if ( $parent_theme ) {
		if ( isset( $last_auto_drafts_versions[ $parent_stylesheet ] ) ) {
			$last_version = $last_auto_drafts_versions[ $parent_stylesheet ];
			if ( version_compare( $parent_theme->version, $last_version, '>' ) ) {
				$create_auto_drafts = true;
			}
		} else {
			$create_auto_drafts = true;
		}
	}

	if ( ! $create_auto_drafts ) {
		return;
	}

	_gutenberg_synchronize_theme_templates( 'template-part' );
	_gutenberg_synchronize_theme_templates( 'template' );

	$last_auto_drafts_versions[ $stylesheet ] = $theme->version;
	if ( $parent_theme ) {
		$last_auto_drafts_versions[ $parent_stylesheet ] = $parent_theme->version;
	}
	update_option( 'gutenberg_last_template_auto_drafts_theme_versions', $last_auto_drafts_versions );
}
add_action( 'wp_loaded', 'gutenberg_synchronize_theme_templates_on_version_change' );
