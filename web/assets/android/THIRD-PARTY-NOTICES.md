# Android API35 reference assets

Roboto 3.005; 2022: Copyright 2011 Google Inc. All Rights Reserved.
The shipped Android NOTICE identifies `roboto-classic_v_3.005`.

`ic_menu_manage`: Copyright (c) 2005-2008, The Android Open Source Project.
The shipped Android NOTICE maps `//system/framework/framework-res.apk` to
`frameworks/base` (content ID `9645f39e9db895a4aa6e02cb57294595`).

Both assets are distributed under the Apache License, Version 2.0; see
`LICENSE-Apache-2.0.txt` alongside this notice.

Source: the local Android API35 Google APIs tablet x86_64 system image matching
the reference capture fingerprint:
`google/sdk_gtablet_x86_64/emu64xa:15/AE3A.240806.046.T1/13135149:userdebug/dev-keys`.
Source image SHA256: `203d1b65acdbecaccdd16542e0bfd77079caf34406faf04e4bdcbccefb81c0ef`.
Evidence: external `parity-reference-v2/native-assets/ASSET-FINDINGS.md`, shipped
`font_fallback.xml`, framework resource table and system NOTICE.

## Distributed files (SHA256)

| File | SHA256 |
| --- | --- |
| `Roboto-Regular.woff2` | `697837d196a61b1dfc60928a80e35164c3f2525871b811e363517752a952d593` |
| `ic-menu-manage-api35-xxhdpi.png` | `1463cc538c405e5d1d33b9b298d0773a8f65e7b55f9246fe3b6b1f7a458d9065` |
| `LICENSE-Apache-2.0.txt` | `3ddf9be5c28fe27dad143a5dc76eea25222ad1dd68934a047064e56ed2fa40c5` |

The WOFF2 is a modified format conversion of shipped `Roboto-Regular.ttf`
(original SHA256 `9ca9debb09459bf4e3e7f826f5cd0f35f253902b85684921fce2ba3f28dd0f50`),
using local fontTools/Brotli. No subsetting, axis instancing or outline
replacement was performed; the normal face retains weights 100–900.
The 96×96 xxhdpi PNG is unchanged shipped resource bytes. CSS draws it at
32×32 pixels and applies a cream alpha mask, preserving its 60% maximum alpha.
No derived PNG, TTF, alternate densities, extraction scripts or runtime network
font dependencies are distributed. Browser rasterization, native font padding
and per-glyph fallback remain distinct from verified asset identity.
