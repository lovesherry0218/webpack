/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

const AsyncDependenciesBlock = require("../AsyncDependenciesBlock");
const CommentCompilationWarning = require("../CommentCompilationWarning");
const UnsupportedFeatureWarning = require("../UnsupportedFeatureWarning");
const ContextDependencyHelpers = require("./ContextDependencyHelpers");
const ImportContextDependency = require("./ImportContextDependency");
const ImportDependency = require("./ImportDependency");
const ImportEagerDependency = require("./ImportEagerDependency");
const ImportWeakDependency = require("./ImportWeakDependency");

/** @typedef {import("../../declarations/WebpackOptions").JavascriptParserOptions} JavascriptParserOptions */
/** @typedef {import("../ChunkGroup").RawChunkGroupOptions} RawChunkGroupOptions */
/** @typedef {import("../ContextModule").ContextMode} ContextMode */
/** @typedef {import("../javascript/JavascriptParser")} JavascriptParser */

class ImportParserPlugin {
	/**
	 * @param {JavascriptParserOptions} options options
	 */
	constructor(options) {
		this.options = options;
	}

	/**
	 * @param {JavascriptParser} parser the parser
	 * @returns {void}
	 */
	apply(parser) {
		const exportsFromEnumerable = enumerable =>
			Array.from(enumerable, e => [e]);
		parser.hooks.importCall.tap("ImportParserPlugin", expr => {
			const param = parser.evaluateExpression(expr.source);

			let chunkName = null;
			/** @type {ContextMode} */
			let mode = this.options.dynamicImportMode;
			let include = null;
			let exclude = null;
			/** @type {string[][] | null} */
			let exports = null;
			/** @type {RawChunkGroupOptions} */
			const groupOptions = {};

			const {
				dynamicImportPreload,
				dynamicImportPrefetch,
				dynamicImportFetchPriority
			} = this.options;
			if (dynamicImportPreload !== undefined && dynamicImportPreload !== false)
				groupOptions.preloadOrder =
					dynamicImportPreload === true ? 0 : dynamicImportPreload;
			if (
				dynamicImportPrefetch !== undefined &&
				dynamicImportPrefetch !== false
			)
				groupOptions.prefetchOrder =
					dynamicImportPrefetch === true ? 0 : dynamicImportPrefetch;
			if (
				dynamicImportFetchPriority !== undefined &&
				dynamicImportFetchPriority !== false
			)
				groupOptions.fetchPriority = dynamicImportFetchPriority;

			const { options: importOptions, errors: commentErrors } =
				parser.parseCommentOptions(expr.range);

			if (commentErrors) {
				for (const e of commentErrors) {
					const { comment } = e;
					parser.state.module.addWarning(
						new CommentCompilationWarning(
							`Compilation error while processing magic comment(-s): /*${comment.value}*/: ${e.message}`,
							comment.loc
						)
					);
				}
			}

			if (importOptions) {
				if (importOptions.webpackIgnore !== undefined) {
					if (typeof importOptions.webpackIgnore !== "boolean") {
						parser.state.module.addWarning(
							new UnsupportedFeatureWarning(
								`\`webpackIgnore\` expected a boolean, but received: ${importOptions.webpackIgnore}.`,
								expr.loc
							)
						);
					} else {
						// Do not instrument `import()` if `webpackIgnore` is `true`
						if (importOptions.webpackIgnore) {
							return false;
						}
					}
				}
				if (importOptions.webpackChunkName !== undefined) {
					if (typeof importOptions.webpackChunkName !== "string") {
						parser.state.module.addWarning(
							new UnsupportedFeatureWarning(
								`\`webpackChunkName\` expected a string, but received: ${importOptions.webpackChunkName}.`,
								expr.loc
							)
						);
					} else {
						chunkName = importOptions.webpackChunkName;
					}
				}
				if (importOptions.webpackMode !== undefined) {
					if (typeof importOptions.webpackMode !== "string") {
						parser.state.module.addWarning(
							new UnsupportedFeatureWarning(
								`\`webpackMode\` expected a string, but received: ${importOptions.webpackMode}.`,
								expr.loc
							)
						);
					} else {
						mode = importOptions.webpackMode;
					}
				}
				if (importOptions.webpackPrefetch !== undefined) {
					if (importOptions.webpackPrefetch === true) {
						groupOptions.prefetchOrder = 0;
					} else if (typeof importOptions.webpackPrefetch === "number") {
						groupOptions.prefetchOrder = importOptions.webpackPrefetch;
					} else {
						parser.state.module.addWarning(
							new UnsupportedFeatureWarning(
								`\`webpackPrefetch\` expected true or a number, but received: ${importOptions.webpackPrefetch}.`,
								expr.loc
							)
						);
					}
				}
				if (importOptions.webpackPreload !== undefined) {
					if (importOptions.webpackPreload === true) {
						groupOptions.preloadOrder = 0;
					} else if (typeof importOptions.webpackPreload === "number") {
						groupOptions.preloadOrder = importOptions.webpackPreload;
					} else {
						parser.state.module.addWarning(
							new UnsupportedFeatureWarning(
								`\`webpackPreload\` expected true or a number, but received: ${importOptions.webpackPreload}.`,
								expr.loc
							)
						);
					}
				}
				if (importOptions.webpackFetchPriority !== undefined) {
					if (
						typeof importOptions.webpackFetchPriority === "string" &&
						["high", "low", "auto"].includes(importOptions.webpackFetchPriority)
					) {
						groupOptions.fetchPriority = importOptions.webpackFetchPriority;
					} else {
						parser.state.module.addWarning(
							new UnsupportedFeatureWarning(
								`\`webpackFetchPriority\` expected true or "low", "high" or "auto", but received: ${importOptions.webpackFetchPriority}.`,
								expr.loc
							)
						);
					}
				}
				if (importOptions.webpackInclude !== undefined) {
					if (
						!importOptions.webpackInclude ||
						!(importOptions.webpackInclude instanceof RegExp)
					) {
						parser.state.module.addWarning(
							new UnsupportedFeatureWarning(
								`\`webpackInclude\` expected a regular expression, but received: ${importOptions.webpackInclude}.`,
								expr.loc
							)
						);
					} else {
						include = importOptions.webpackInclude;
					}
				}
				if (importOptions.webpackExclude !== undefined) {
					if (
						!importOptions.webpackExclude ||
						!(importOptions.webpackExclude instanceof RegExp)
					) {
						parser.state.module.addWarning(
							new UnsupportedFeatureWarning(
								`\`webpackExclude\` expected a regular expression, but received: ${importOptions.webpackExclude}.`,
								expr.loc
							)
						);
					} else {
						exclude = importOptions.webpackExclude;
					}
				}
				if (importOptions.webpackExports !== undefined) {
					if (
						!(
							typeof importOptions.webpackExports === "string" ||
							(Array.isArray(importOptions.webpackExports) &&
								importOptions.webpackExports.every(
									item => typeof item === "string"
								))
						)
					) {
						parser.state.module.addWarning(
							new UnsupportedFeatureWarning(
								`\`webpackExports\` expected a string or an array of strings, but received: ${importOptions.webpackExports}.`,
								expr.loc
							)
						);
					} else {
						if (typeof importOptions.webpackExports === "string") {
							exports = [[importOptions.webpackExports]];
						} else {
							exports = exportsFromEnumerable(importOptions.webpackExports);
						}
					}
				}
			}

			if (
				mode !== "lazy" &&
				mode !== "lazy-once" &&
				mode !== "eager" &&
				mode !== "weak"
			) {
				parser.state.module.addWarning(
					new UnsupportedFeatureWarning(
						`\`webpackMode\` expected 'lazy', 'lazy-once', 'eager' or 'weak', but received: ${mode}.`,
						expr.loc
					)
				);
				mode = "lazy";
			}

			const referencedPropertiesInDestructuring =
				parser.destructuringAssignmentPropertiesFor(expr);
			if (referencedPropertiesInDestructuring) {
				if (exports) {
					parser.state.module.addWarning(
						new UnsupportedFeatureWarning(
							`\`webpackExports\` could not be used with destructuring assignment.`,
							expr.loc
						)
					);
				}
				exports = exportsFromEnumerable(referencedPropertiesInDestructuring);
			}

			if (param.isString()) {
				if (mode === "eager") {
					const dep = new ImportEagerDependency(
						param.string,
						expr.range,
						exports
					);
					parser.state.current.addDependency(dep);
				} else if (mode === "weak") {
					const dep = new ImportWeakDependency(
						param.string,
						expr.range,
						exports
					);
					parser.state.current.addDependency(dep);
				} else {
					const depBlock = new AsyncDependenciesBlock(
						{
							...groupOptions,
							name: chunkName
						},
						expr.loc,
						param.string
					);
					const dep = new ImportDependency(param.string, expr.range, exports);
					dep.loc = expr.loc;
					depBlock.addDependency(dep);
					parser.state.current.addBlock(depBlock);
				}
				return true;
			} else {
				if (mode === "weak") {
					mode = "async-weak";
				}
				const dep = ContextDependencyHelpers.create(
					ImportContextDependency,
					expr.range,
					param,
					expr,
					this.options,
					{
						chunkName,
						groupOptions,
						include,
						exclude,
						mode,
						namespaceObject: parser.state.module.buildMeta.strictHarmonyModule
							? "strict"
							: true,
						typePrefix: "import()",
						category: "esm",
						referencedExports: exports
					},
					parser
				);
				if (!dep) return;
				dep.loc = expr.loc;
				dep.optional = !!parser.scope.inTry;
				parser.state.current.addDependency(dep);
				return true;
			}
		});
	}
}

module.exports = ImportParserPlugin;
