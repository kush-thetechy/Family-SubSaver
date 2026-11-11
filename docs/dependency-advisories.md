# Dependency advisories (npm audit --omit=dev)

Resolved versions come from package-lock.json. Re-run `npm audit --omit=dev --json` before any release decision.

## Production main (Next 14.2.35)
- `next` 14.2.35: https://registry.npmjs.org/next/-/next-14.2.35.tgz. Advisories fixed at or below 15.5.27. IDs (all https://github.com/advisories/<ID>):
  GHSA-9g9p-9gw9-jx7f, GHSA-h25m-26qc-wcjf, GHSA-ggv3-7p47-pfv8, GHSA-3x4c-7xq6-9pq8, GHSA-q4gf-8mx6-v5v3,
  GHSA-8h8q-6873-q5fj, GHSA-3g8h-86w9-wvmq, GHSA-ffhc-5mcf-pf4q, GHSA-vfv6-92ff-j949, GHSA-gx5p-jg67-6x7h,
  GHSA-h64f-5h5j-jqjh, GHSA-c4j6-fc7j-m34r, GHSA-wfc6-r584-vfw7, GHSA-36qx-fr4f-26g5, GHSA-m99w-x7hq-7vfj,
  GHSA-89xv-2m56-2m9x, GHSA-68g3-v927-f742, GHSA-4633-3j49-mh5q, GHSA-4c39-4ccg-62r3, GHSA-p9j2-gv94-2wf4,
  GHSA-955p-x3mx-jcvp, GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4, GHSA-2464-fhr4-w9xw, GHSA-p3m5-59mp-jv5r.
- `postcss` (bundled in next): 8.4.31.

## Branch chore/next-upgrade (Next 15.5.28)
- `next` 15.5.28: https://registry.npmjs.org/next/-/next-15.5.28.tgz (integrity sha512-JjhLBBY1PNnuwPtcZ7t8yxVeJVYvD2Jyp633J+gRCNbzSt7N0E+xqCf6uQiff3+3qmUkwcF/ksfSsK1xsZ76Tw==). All of the above advisories have affected ranges ending at or below 15.5.27, so none apply.
- Still reported: `postcss` 8.4.31 at node_modules/next/node_modules/postcss (https://registry.npmjs.org/postcss/-/postcss-8.4.31.tgz), advisories
  GHSA-qx2v-qp2m-jg93 (<8.5.10), GHSA-6g55-p6wh-862q (<=8.5.11), GHSA-fxqj-rqcc-2cmp (<=8.5.22), GHSA-r28c-9q8g-f849 (<=8.5.17).
  npm audit marks the only fix as next 16.4.3 (major). PostCSS runs at build time on this repo's own CSS; no runtime user input reaches it.
- Not claimed: per-advisory exploitability for this app was reasoned from features used (no next/image, rewrites, server actions, Pages Router, custom server), not tested.
