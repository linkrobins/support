// Flarum exposes these as runtime globals on the page. The current code (and
// every other linkrobins extension) references them globally rather than
// importing, which guarantees we share core's single mithril / app instance.
declare const app: any;
declare const m: any;
declare const flarum: any;

// Allow `import X from 'flarum/...'` without the full core typings installed.
// The flarum-webpack externals rewrite these to `flarum.reg.get('core', ...)`
// at build time, so they resolve at runtime regardless of compile-time types.
declare module 'flarum/*';
