/**
 * External dependencies
 */
import classnames from 'classnames';
import { noop } from 'lodash';

/**
 * WordPress dependencies
 */
import { useEffect, useRef, useState } from '@wordpress/element';

/**
 * Internal dependencies
 */
import { useAnimate } from '../animate';
import { ROOT_MENU } from './constants';
import { NavigationContext } from './context';
import { NavigationUI } from './styles/navigation-styles';
import { useCreateNavigationTree } from './use-create-navigation-tree';
import { useRTL } from '../utils/rtl';

export default function Navigation( {
	activeItem,
	activeMenu = ROOT_MENU,
	children,
	className,
	onActivateMenu = noop,
} ) {
	const [ menu, setMenu ] = useState( activeMenu );
	const [ slideOrigin, setSlideOrigin ] = useState();
	const navigationTree = useCreateNavigationTree();
	const defaultSlideOrigin = useRTL() ? 'right' : 'left';

	const setActiveMenu = ( menuId, slideInOrigin = defaultSlideOrigin ) => {
		if ( ! navigationTree.getMenu( menuId ) ) {
			return;
		}

		setSlideOrigin( slideInOrigin );
		setMenu( menuId );
		onActivateMenu( menuId );
	};

	// Used to prevent the sliding animation on mount
	const isMounted = useRef( false );
	useEffect( () => {
		if ( ! isMounted.current ) {
			isMounted.current = true;
		}
	}, [] );

	useEffect( () => {
		if ( activeMenu !== menu ) {
			setActiveMenu( activeMenu );
		}
	}, [ activeMenu ] );

	const findByParentMenu = ( parentMenu ) =>
		navigationTree.parentMenuToMenu[ parentMenu ] || [];

	const isEmpty = ( menuToCheck ) => {
		let count = 0;

		if ( ! navigationTree.menus[ menuToCheck ]?.isEmpty ) {
			count++;
		}

		const visited = [];
		let queue = findByParentMenu( menuToCheck );
		let current;
		while ( queue.length ) {
			current = queue.shift();

			if ( current && ! visited.includes( current.menu ) ) {
				if ( ! current.isEmpty ) {
					count++;
				}

				visited.push( current.menu );
				queue = [ ...queue, ...findByParentMenu( current.menu ) ];
			}
		}

		return count === 0;
	};

	const context = {
		activeItem,
		activeMenu: menu,
		setActiveMenu,
		navigationTree,
		isEmpty,
	};

	const classes = classnames( 'components-navigation', className );
	const animateClassName = useAnimate( {
		type: 'slide-in',
		origin: slideOrigin,
	} );

	return (
		<NavigationUI className={ classes }>
			<div
				key={ menu }
				className={ classnames( {
					[ animateClassName ]: isMounted.current && slideOrigin,
				} ) }
			>
				<NavigationContext.Provider value={ context }>
					{ children }
				</NavigationContext.Provider>
			</div>
		</NavigationUI>
	);
}
