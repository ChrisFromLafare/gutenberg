/**
 * External dependencies
 */
import { omit, without, mapValues } from 'lodash';
import memize from 'memize';

/**
 * WordPress dependencies
 */
import { createAtomRegistry, createStoreAtom } from '@wordpress/stan';

/**
 * Internal dependencies
 */
import createNamespace from './namespace-store';
import createCoreDataStore from './store';
import { createAtomicStore } from './atomic-store';

/**
 * @typedef {Object} WPDataRegistry An isolated orchestrator of store registrations.
 *
 * @property {Function} registerGenericStore Given a namespace key and settings
 *                                           object, registers a new generic
 *                                           store.
 * @property {Function} registerStore        Given a namespace key and settings
 *                                           object, registers a new namespace
 *                                           store.
 * @property {Function} subscribe            Given a function callback, invokes
 *                                           the callback on any change to state
 *                                           within any registered store.
 * @property {Function} select               Given a namespace key, returns an
 *                                           object of the  store's registered
 *                                           selectors.
 * @property {Function} dispatch             Given a namespace key, returns an
 *                                           object of the store's registered
 *                                           action dispatchers.
 */

/**
 * @typedef {Object} WPDataPlugin An object of registry function overrides.
 *
 * @property {Function} registerStore registers store.
 */

/**
 * Creates a new store registry, given an optional object of initial store
 * configurations.
 *
 * @param {Object}  storeConfigs Initial store configurations.
 * @param {Object?} parent       Parent registry.
 *
 * @return {WPDataRegistry} Data registry.
 */
export function createRegistry( storeConfigs = {}, parent = null ) {
	const stores = {};
	const storesAtoms = {};
	const atomsUnsubscribe = {};
	const atomRegistry = createAtomRegistry(
		( atom ) => {
			const unsubscribeFromAtom = atom.subscribe( globalListener );
			atomsUnsubscribe[ atom ] = unsubscribeFromAtom;
		},
		( atom ) => {
			atomsUnsubscribe[ atom ]();
		}
	);
	let listeners = [];

	/**
	 * Global listener called for each store's update.
	 */
	function globalListener() {
		listeners.forEach( ( listener ) => listener() );
	}

	/**
	 * Subscribe to changes to any data.
	 *
	 * @param {Function}   listener Listener function.
	 *
	 * @return {Function}           Unsubscribe function.
	 */
	const subscribe = ( listener ) => {
		listeners.push( listener );

		return () => {
			listeners = without( listeners, listener );
		};
	};

	/**
	 * Calls a selector given the current state and extra arguments.
	 *
	 * @param {string} reducerKey Part of the state shape to register the
	 *                            selectors for.
	 *
	 * @return {*} The selector's returned value.
	 */
	function select( reducerKey ) {
		const store = stores[ reducerKey ];
		if ( store ) {
			if ( registry.__unstableGetAtomResolver() ) {
				registry.__unstableGetAtomResolver()(
					registry.getStoreAtom( reducerKey )
				);
			}

			return store.getSelectors();
		}

		if ( parent ) {
			parent.__unstableSetAtomResolver(
				registry.__unstableGetAtomResolver()
			);
			const ret = parent.select( reducerKey );
			return ret;
		}
	}

	const getResolveSelectors = memize(
		( selectors ) => {
			return mapValues(
				omit( selectors, [
					'getIsResolving',
					'hasStartedResolution',
					'hasFinishedResolution',
					'isResolving',
					'getCachedResolvers',
				] ),
				( selector, selectorName ) => {
					return ( ...args ) => {
						return new Promise( ( resolve ) => {
							const hasFinished = () =>
								selectors.hasFinishedResolution(
									selectorName,
									args
								);
							const getResult = () =>
								selector.apply( null, args );

							// trigger the selector (to trigger the resolver)
							const result = getResult();
							if ( hasFinished() ) {
								return resolve( result );
							}

							const unsubscribe = subscribe( () => {
								if ( hasFinished() ) {
									unsubscribe();
									resolve( getResult() );
								}
							} );
						} );
					};
				}
			);
		},
		{ maxSize: 1 }
	);

	/**
	 * Given the name of a registered store, returns an object containing the store's
	 * selectors pre-bound to state so that you only need to supply additional arguments,
	 * and modified so that they return promises that resolve to their eventual values,
	 * after any resolvers have ran.
	 *
	 * @param {string} reducerKey Part of the state shape to register the
	 *                            selectors for.
	 *
	 * @return {Object} Each key of the object matches the name of a selector.
	 */
	function __experimentalResolveSelect( reducerKey ) {
		return getResolveSelectors( select( reducerKey ) );
	}

	/**
	 * Returns the available actions for a part of the state.
	 *
	 * @param {string} reducerKey Part of the state shape to dispatch the
	 *                            action for.
	 *
	 * @return {*} The action's returned value.
	 */
	function dispatch( reducerKey ) {
		const store = stores[ reducerKey ];
		if ( store ) {
			return store.getActions();
		}

		return parent && parent.dispatch( reducerKey );
	}

	//
	// Deprecated
	// TODO: Remove this after `use()` is removed.
	//
	function withPlugins( attributes ) {
		return mapValues( attributes, ( attribute, key ) => {
			if ( typeof attribute !== 'function' ) {
				return attribute;
			}
			return function () {
				return registry[ key ].apply( null, arguments );
			};
		} );
	}

	/**
	 * Registers a generic store.
	 *
	 * @param {string} key    Store registry key.
	 * @param {Object} config Configuration (getSelectors, getActions, subscribe).
	 */
	function registerGenericStore( key, config ) {
		if ( typeof config.getSelectors !== 'function' ) {
			throw new TypeError( 'config.getSelectors must be a function' );
		}
		if ( typeof config.getActions !== 'function' ) {
			throw new TypeError( 'config.getActions must be a function' );
		}
		if ( typeof config.subscribe !== 'function' ) {
			throw new TypeError( 'config.subscribe must be a function' );
		}
		stores[ key ] = config;
		storesAtoms[ key ] = createStoreAtom(
			config.subscribe,
			() => null,
			() => {},
			key
		);
		config.subscribe( globalListener );
	}

	function getStoreAtom( key ) {
		const atom = storesAtoms[ key ];
		if ( atom ) {
			return atom;
		}

		return parent.getStoreAtom( key );
	}

	let __unstableAtomResolver;
	function __unstableGetAtomResolver() {
		return __unstableAtomResolver;
	}
	function __unstableSetAtomResolver( value ) {
		__unstableAtomResolver = value;
	}

	let registry = {
		getAtomRegistry() {
			return atomRegistry;
		},
		registerGenericStore,
		stores,
		namespaces: stores, // TODO: Deprecate/remove this.
		subscribe,
		select,
		__experimentalResolveSelect,
		dispatch,
		use,
		getStoreAtom,
		__unstableGetAtomResolver,
		__unstableSetAtomResolver,
	};

	/**
	 * Registers a standard `@wordpress/data` store.
	 *
	 * @param {string} reducerKey Reducer key.
	 * @param {Object} options    Store description (reducer, actions, selectors, resolvers).
	 *
	 * @return {Object} Registered store object.
	 */
	registry.registerStore = ( reducerKey, options ) => {
		if ( ! options.reducer ) {
			throw new TypeError( 'Must specify store reducer' );
		}

		const namespace = createNamespace( reducerKey, options, registry );
		registerGenericStore( reducerKey, namespace );
		return namespace.store;
	};

	registry.registerAtomicStore = ( reducerKey, options ) => {
		const store = createAtomicStore( options, registry );
		registerGenericStore( reducerKey, store );
	};

	//
	// TODO:
	// This function will be deprecated as soon as it is no longer internally referenced.
	//
	function use( plugin, options ) {
		registry = {
			...registry,
			...plugin( registry, options ),
		};

		return registry;
	}

	registerGenericStore( 'core/data', createCoreDataStore( registry ) );

	Object.entries( storeConfigs ).forEach( ( [ name, config ] ) =>
		registry.registerStore( name, config )
	);

	if ( parent ) {
		parent.subscribe( globalListener );
	}

	return withPlugins( registry );
}
