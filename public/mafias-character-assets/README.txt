MAFIAS Character Preview Assets
================================

Variants:
- female-red.png
- female-brown.png
- female-orange.png
- male-red.png
- male-brown.png
- male-orange.png

Each PNG is 1024 x 1536 RGBA with an alpha channel. The checkerboard is used only in the separate preview image; it is not baked into these assets.

Suggested frontend mapping:
const characterAssets = {
  female: {
    red: "/images/characters/female-red.png",
    brown: "/images/characters/female-brown.png",
    orange: "/images/characters/female-orange.png",
  },
  male: {
    red: "/images/characters/male-red.png",
    brown: "/images/characters/male-brown.png",
    orange: "/images/characters/male-orange.png",
  },
};

Suggested CSS:
.character-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center bottom;
  background: transparent;
}

Do not apply a CSS filter to recolor the complete character image; use the correct pre-rendered variant for the selected gender and tag. Keep the character panel background, smoke, and light effects in the website UI behind the PNG.

Note: These are six separately generated illustrative variants, so facial details and clothing ornamentation may vary slightly between colors. Review the images in the supplied preview before publishing.
