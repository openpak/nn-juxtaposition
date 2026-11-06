import { createConfig, zodV4SchemaToTransformer, loaders } from '@neato/config';
import * as z from 'zod';
import type { SchemaTransformer, SchemaTransformerContext } from '@neato/config';

// schema is mapped later to nested object to keep env vars consistent with other projects
const schema = z.object({
	log: z.object({
		format: z.enum(['json', 'pretty']).default('pretty'),
		level: z.enum(['error', 'warn', 'info', 'debug', 'trace']).default('info'),
		/** Enable or disable logging of sensitive HTTP headers (cookies, tokens etc.) in the JSON log */
		sensitive: z.stringbool().default(false)
	}).prefault({}),
	http: z.object({
		port: z.coerce.number().default(8080),
		cookieDomain: z.string().default('.openpak.org'),
		/** "Safe" base origin for login-redirect validation */
		baseUrl: z.string().default('https://verse.openpak.org'),
		/** Configures proxy trust (X-Forwarded-For etc.). Can be `true` to unconditionally trust, or
		 *  provide a numeric hop count, or comma-seperated CIDR ranges.
		 *  See https://expressjs.com/en/guide/behind-proxies.html
		 */
		trustProxy: z.union([z.coerce.number(), z.stringbool(), z.string()]).default(false)
	}).prefault({}),
	/** Whether to expose Prometheus metrics on a different port, path /metrics. */
	metrics: z.object({
		enabled: z.stringbool().default(false),
		port: z.coerce.number().default(9090)
	}).prefault({}),
	/** Maximum posts per-page to show on most feeds. Higher settings increase DB load. */
	postLimit: z.coerce.number().default(10),
	/** CDN path hosting Mii images, icons, etc. ${cdnDomain}/mii/100000000/normal_face.png */
	cdnDomain: z.string(),
	/** Value for X-Nintedo-Whitelist header. */
	whitelist: z.string(),
	/** Environment (prod/test/dev) to use for Discovery and access_level control. */
	serverEnvironment: z.string(),
	/** By default, only consoles can reach the console domains. This setting disable that constraint */
	disableConsoleChecks: z.stringbool().default(false),
	/** AES key for encrypting session */
	aesKey: z.string(),
	grpc: z.object({
		account: z.object({
			host: z.string(),
			port: z.string(),
			apiKey: z.string()
		}),
		miiverse: z.object({
			host: z.string(),
			port: z.string(),
			apiKey: z.string()
		})
	}),
	ratelimit: z.object({
		yeahs: z.stringbool().default(true),
		posts: z.stringbool().default(true)
	}).prefault({}),
	/** Postgres for web sessions and device link codes (they used to live in Redis). */
	db: z.object({
		url: z.string()
	}),
	/** openpak.org single sign-on (web sign-in only; consoles keep their own login). */
	sso: z.object({
		clientId: z.string().default('openverse'),
		/** Shared .env already carries SSO_CLIENT_OPENVERSE_SECRET for the website. */
		clientSecret: z.string().default(process.env.SSO_CLIENT_OPENVERSE_SECRET ?? ''),
		authorizeUrl: z.string().default('https://openpak.org/account/sso/authorize'),
		/** Private-network address of the website's token endpoint. */
		tokenUrl: z.string().default('http://openpak-website:20010/internal/sso/token'),
		linkUrl: z.string().default('https://openpak.org/account')
	}).prefault({}),
	/** OpenVerse Lite: plain-HTTP pages and a feed for older consoles (PS3, Wii, DSi browsers, Xbox 360 dashboard). */
	lite: z.object({
		/** Comma-separated hostnames that serve Lite. Served from our own edge, not through Cloudflare (old TLS). */
		hosts: z.string().default('lite.verse.openpak.org'),
		/** Private-network address of the API's /cdn route, for the drawing proxy. */
		cdnInternalUrl: z.string().default('http://openpak-nn-juxtaposition-api:20090'),
		/** Where people approve a link code (always HTTPS, behind openpak.org sign-in). */
		approveUrl: z.string().default('https://verse.openpak.org/devices')
	}).prefault({}),
	domains: z.object({
		/** Comma-separated list of hostnames that serve the web UI. */
		web: z.string().default('verse.openpak.org'),
		ctr: z.hostname().default('ctr.olv.openpak.org'),
		portal: z.hostname().default('portal.olv.openpak.org')
	}).prefault({})
});

export const presets = {
	docker: {
		http: {
			port: 5173,
			trustProxy: 'loopback'
		},
		cdnDomain: 'https://api.olv.openpak.org/cdn',
		whitelist: '',
		serverEnvironment: 'prod',
		disableConsoleChecks: true,
		aesKey: '1234567812345678123456781234567812345678123456781234567812345678',
		grpc: {
			account: {
				host: 'localhost',
				port: 8123,
				apiKey: '12345678123456781234567812345678'
			},
			miiverse: {
				host: 'localhost',
				port: 8125,
				apiKey: '12345678123456781234567812345678'
			}
		},
		db: {
			url: 'postgres://localhost:5432/juxtaposition_ui'
		}
	}
};

function flatZodSchema<T extends z.ZodType>(schema: T): SchemaTransformer<z.infer<T>> {
	const transformer = zodV4SchemaToTransformer<z.infer<T>>(schema);
	return {
		extract: () => transformer.extract().map(v => ({
			...v,
			normalizedKey: v.normalizedKey.replaceAll('__', '_')
		})),
		validate: (ctx: SchemaTransformerContext) => transformer.validate(ctx)
	};
}

export const config = createConfig({
	envPrefix: 'PN_JUXTAPOSITION_UI_',
	presetKey: 'usePresets',
	presets,
	loaders: [
		loaders.environment(),
		loaders.file('.env'),
		loaders.file('config.json')
	],
	schema: flatZodSchema(schema)
});

export type Config = typeof config;
