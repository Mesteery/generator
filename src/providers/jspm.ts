import { throwInternalError } from "../common/err.js";
import { JspmError } from "../common/err.js";
import { importedFrom } from "../common/url.js";
import { LatestPackageTarget } from "../install/package.js";
import { pkgToStr } from "../install/package.js";
import { ExactPackage } from "../install/package.js";
import { Resolver } from "../trace/resolver.js";
// @ts-ignore
import { fetch } from '#fetch';

const cdnUrl = 'https://ga.jspm.io/';
const systemCdnUrl = 'https://ga.system.jspm.io/';

export function pkgToUrl (pkg: ExactPackage, layer: string) {
  return (layer === 'system' ? systemCdnUrl : cdnUrl) + pkgToStr(pkg) + '/';
}

const exactPkgRegEx = /^(([a-z]+):)?((?:@[^/\\%@]+\/)?[^./\\%@][^/\\%@]*)@([^\/]+)(\/.*)?$/;
export function parseUrlPkg (url: string): { pkg: ExactPackage, layer: string } | undefined {
  let layer: string;
  if (url.startsWith(cdnUrl))
    layer = 'default';
  else if (url.startsWith(systemCdnUrl))
    layer = 'system';
  else
    return;
  const [,, registry, name, version] = url.slice((layer === 'default' ? cdnUrl : systemCdnUrl).length).match(exactPkgRegEx) || [];
  return { pkg: { registry, name, version }, layer };
}

let resolveCache: Record<string, {
  latest: Promise<ExactPackage | null>;
  majors: Record<string, Promise<ExactPackage | null>>;
  minors: Record<string, Promise<ExactPackage | null>>;
  tags: Record<string, Promise<ExactPackage | null>>;
}> = {};

export function clearResolveCache () {
  resolveCache = {};
}

export async function resolveLatestTarget (this: Resolver, target: LatestPackageTarget, unstable: boolean, _layer: string, parentUrl: string): Promise<ExactPackage | null> {
  const { registry, name, range } = target;

  // exact version optimization
  if (range.isExact && !range.version.tag)
    return { registry, name, version: range.version.toString() };

  const cache = resolveCache[target.registry + ':' + target.name] = resolveCache[target.registry + ':' + target.name] || {
    latest: null,
    majors: Object.create(null),
    minors: Object.create(null),
    tags: Object.create(null)
  };

  if (range.isWildcard) {
    let lookup = await (cache.latest || (cache.latest = lookupRange.call(this, registry, name, '', unstable, parentUrl)));
    // Deno wat?
    if (lookup instanceof Promise)
      lookup = await lookup;
    if (lookup) {
      if (lookup instanceof Promise)
        throwInternalError();
      this.log('resolve', `${target.registry}:${target.name}@${range} -> WILDCARD ${lookup.version}${parentUrl ? ' [' + parentUrl + ']' : ''}`);
      return lookup;
    }
  }
  else if (range.isExact && range.version.tag) {
    const tag = range.version.tag;
    let lookup = await (cache.tags[tag] || (cache.tags[tag] = lookupRange.call(this, registry, name, tag, unstable, parentUrl)));
    // Deno wat?
    if (lookup instanceof Promise)
    lookup = await lookup;
    if (lookup) {
      if (lookup instanceof Promise)
        throwInternalError();
      this.log('resolve', `${target.registry}:${target.name}@${range} -> TAG ${tag}${parentUrl ? ' [' + parentUrl + ']' : ''}`);
      return lookup;
    }
  }
  else if (range.isMajor) {
    const major = range.version.major;
    let lookup = await (cache.majors[major] || (cache.majors[major] = lookupRange.call(this, registry, name, major, unstable, parentUrl)));
    // Deno wat?
    if (lookup instanceof Promise)
      lookup = await lookup;
    if (lookup) {
      if (lookup instanceof Promise)
        throwInternalError();
      this.log('resolve', `${target.registry}:${target.name}@${range} -> MAJOR ${lookup.version}${parentUrl ? ' [' + parentUrl + ']' : ''}`);
      return lookup;
    }
  }
  else if (range.isStable) {
    const minor = `${range.version.major}.${range.version.minor}`;
    let lookup = await (cache.minors[minor] || (cache.minors[minor] = lookupRange.call(this, registry, name, minor, unstable, parentUrl)));
    // Deno wat?
    if (lookup instanceof Promise)
      lookup = await lookup;
    if (lookup) {
      if (lookup instanceof Promise)
        throwInternalError();
      this.log('resolve', `${target.registry}:${target.name}@${range} -> MINOR ${lookup.version}${parentUrl ? ' [' + parentUrl + ']' : ''}`);
      return lookup;
    }
  }
  return null;
}

function pkgToLookupUrl (pkg: ExactPackage, edge = false) {
  return `${cdnUrl}${pkg.registry}:${pkg.name}${pkg.version ? '@' + pkg.version : edge ? '@' : ''}`;
}
async function lookupRange (this: Resolver, registry: string, name: string, range: string, unstable: boolean, parentUrl?: string): Promise<ExactPackage | null> {
  const res = await fetch(pkgToLookupUrl({ registry, name, version: range }, unstable), this.fetchOpts);
  switch (res.status) {
    case 304:
    case 200:
      return { registry, name, version: (await res.text()).trim() };
    case 404:
      return null;
    default:
      throw new JspmError(`Invalid status code ${res.status} looking up "${registry}:${name}" - ${res.statusText}${importedFrom(parentUrl)}`);
  }
}
