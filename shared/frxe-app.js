import { recommendAsset } from './release-classifier.js';

export const FRXE_APP = {
  id: 'frxe',
  name: 'Frxe',
  sources: [
    { repo: 'voidnont/Frxe-Windows', platformHint: 'windows' },
    { repo: 'voidnont/frxe', platformHint: 'android' },
  ],
};

export function mergeFrxeSources(sourceSummaries = [], target = { os: 'unknown', arch: 'unknown' }) {
  const taggedAssets = sourceSummaries.flatMap((source) =>
    (source.assets || []).map((asset) => ({ ...asset, repo: source.repo })),
  );
  const recommended = target.os === 'unknown' ? null : recommendAsset(taggedAssets, target);
  return {
    id: FRXE_APP.id,
    name: FRXE_APP.name,
    sources: sourceSummaries,
    assets: taggedAssets,
    availablePlatforms: [...new Set(taggedAssets
      .filter((asset) => asset.installable && asset.platform !== 'unknown')
      .map((asset) => asset.platform))],
    recommended,
  };
}
