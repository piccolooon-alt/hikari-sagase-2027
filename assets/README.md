# 素材の引き継ぎ

背景・ボタンの原画・ヨーヨー・採用済み浴衣の子・BGMは、ユーザー提供の引き継ぎZIPから**ファイル内容を変更せず**配置しています。ハッシュと由来は `docs/asset-manifest.json` に記録しています。素材の再生成はしていません。

はじめの画面は `welcome_background_no_buttons.png` を使用します。タイトルと「ふじさんに光を灯そう！」は背景に含まれています。ボタンも含む `welcome_1855_reference.png` は参照用です。

`buttons/*_preview.png` の3ファイルは、承認済み参考HTML内のPNGをそのまま抽出したものです。元PNGも残しています。参考HTMLと同じ透明余白・配置を維持するため、画面には抽出したボタンを使います。

`red-game/yoyos/` の切り抜きPNGには、シート内で隣にあったヨーヨーの端が一部残っています。PNGの内容は変更せず、表示時のCSS `clip-path` でその残片のみを隠しています。選んだヨーヨーの本体・紐は維持しています。

BGMは明示的に採用された `audio/four_lights_of_suzuran.mp3` です。参考HTML内の別圧縮データに置き換えていません。

`fonts/` は M PLUS Rounded 1c の配布フォントです。出典・配布バージョン・取得時の整合性検証・SIL Open Font Licenseは同フォルダーの `SOURCE.md`、`SHA256SUMS`、`OFL.txt` を参照してください。

このリポジトリへの収録は、提供された素材全体を新たなライセンスで再許諾するものではありません。
