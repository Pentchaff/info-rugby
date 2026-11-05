# info-rugby

App web pour suivre le rugby à XV : calendrier, où regarder en France, scores, résumés vidéo, joueurs.

**Site :** https://pentchaff.github.io/info-rugby/

- Cahier des charges : [`docs/SPEC.md`](docs/SPEC.md) · vocabulaire : [`GLOSSARY.md`](GLOSSARY.md) · décisions : [`docs/adr/`](docs/adr/)

## Fonctionnement

- Site statique (Astro) publié sur GitHub Pages.
- Le workflow [`.github/workflows/site.yml`](.github/workflows/site.yml) tourne toutes les 15 min : le collecteur (`collector/`) récupère les données (ESPN, Wikidata, flux RSS YouTube) dans `data/`, puis le site est régénéré et redéployé.
- La recherche des diffuseurs se fait sur le téléphone, avec la clé Gemini de chacun (écran Réglages).

## Réglages à la main (dans `config/`)

| Fichier | Rôle |
| --- | --- |
| `corrections-diffusion.json` | Corriger le diffuseur d'un match (l'identifiant est affiché en bas de la page du match) |
| `competitions.json` | Compétitions suivies, identifiants ESPN, diffuseur habituel |
| `youtube.json` | Chaînes officielles utilisées pour les résumés |
| `teams.json` | Noms français des équipes et alias pour reconnaître les vidéos |

## Développement

```sh
npm install
npx tsx scripts/make-fixtures.ts          # données fictives (sans réseau)
DATA_DIR=fixtures/data npm run dev
npm run collect -- full                   # collecte réelle (nécessite l'accès à ESPN, Wikidata, YouTube)
npm run check                             # vérification TypeScript (après `npx astro sync`)
```
