# Info Rugby : cahier des charges V1

Issu de la session de grilling du 5 novembre 2026. Le vocabulaire (mots en **gras** ci-dessous) est défini dans [`GLOSSARY.md`](../GLOSSARY.md). Les décisions structurantes sont dans [`docs/adr/`](./adr/).

## 1. Objectif et public

- Application web personnelle pour suivre le rugby : horaires, où regarder, scores, résumés, joueurs.
- Utilisateur principal : le propriétaire. Partage possible par lien avec des proches (amis, famille).
- **Pas de comptes ni d'authentification.** Les préférences sont stockées sur chaque appareil (localStorage).
- Usage visé : ouverte souvent depuis l'écran d'accueil du téléphone (« c'est à quelle heure, sur quelle chaîne, quel score ? »).

## 2. Périmètre

### Compétitions suivies (rugby à XV masculin)

- Top 14, Pro D2
- Champions Cup, Challenge Cup
- Six Nations, tests internationaux (novembre / été), Rugby Championship, Coupe du monde

### Exclu de la V1

- Scores en direct
- Rappels, notifications push, abonnements calendrier (.ics)
- Mode anti-spoiler
- Joueurs favoris
- Rugby féminin, rugby à 7, autres championnats (URC, Premiership, Super Rugby…)
- Stats des saisons antérieures à 2026-27

## 3. Contraintes générales

- Interface en **français**. Toutes les heures sont affichées en **heure de Paris** (Europe/Paris).
- **Mobile d'abord**, installable comme PWA (manifest et icône), mais sans mode hors ligne exigé.
- Thème clair et sombre selon le réglage du système.
- Coût cible **0 €/mois**. Seule exception acceptée : API-Sports payant (environ 15 $/mois) en repli d'ESPN.
- Le nom affiché est « Info Rugby ».

## 4. Architecture (voir ADR 0001)

- **Hébergement** : GitHub Pages, site 100 % statique. Le dépôt doit être public (compte GitHub gratuit).
- **Stack** : Astro et TypeScript. Toutes les pages sont pré-générées en HTML. Le JavaScript côté client est limité aux **Équipes favorites**, à la recherche et aux filtres.
- **Collecte** : un workflow GitHub Actions planifié :
  1. il appelle les sources externes ;
  2. il écrit des fichiers de données JSON versionnés dans le dépôt ;
  3. il rebuild le site et le déploie sur Pages.
- **Secrets** : la clé Google (Gemini) est dans les secrets GitHub Actions. Aucune clé ne doit apparaître dans le site publié.
- **Fréquence de collecte** :
  - toutes les 15 min pendant les créneaux de match (du coup d'envoi jusqu'à environ 2 h 30 après) ;
  - quelques fois par jour en dehors de ces créneaux.

  Utiliser une minute « impaire » dans le cron, car GitHub Actions retarde les tâches de 5 à 30 min.
- **Objectif de fraîcheur** : le **Score final** est visible environ 30 min après la fin du **Match**.
- **Activité du dépôt** : les commits de données du bot empêchent GitHub de désactiver les workflows planifiés (désactivation après 60 jours sans activité).
- **Affichage** : chaque page indique « mis à jour il y a X min ».

## 5. Sources de données

| Donnée | Source | Notes |
| --- | --- | --- |
| Matchs, horaires, Scores finaux, Feuilles de match, Classements, effectifs, logos | API non officielle ESPN (`site.api.espn.com/apis/site/v2/sports/rugby/{leagueId}/…`), sans clé (ADR 0002) | Accès derrière un **adaptateur** interchangeable. Repli : API-Sports Rugby payant. |
| Diffuseur d'un Match | Gemini avec Google Search grounding, clé Google | Voir §6 |
| Résumés | Flux RSS YouTube des **Chaînes officielles** et oEmbed YouTube | Voir §7. Sans clé, l'API YouTube Data n'est pas utilisée. |
| Parcours d'un Joueur | Wikidata (clubs et sélections avec dates de début et de fin) | Sans clé |

### À vérifier en tout premier (spike)

1. Les identifiants ESPN de chaque Compétition et la couverture de la Pro D2. Si la Pro D2 est absente, décider entre API-Sports payant et l'abandon de la Pro D2 en V1.
2. Le contenu des endpoints ESPN « summary » pour le rugby : Feuille de match, marqueurs, stats joueurs avancées (plaquages, mètres, franchissements, turnovers).
3. Les identifiants des chaînes YouTube officielles et le comportement d'oEmbed sur une vidéo non intégrable.
4. La couverture de Wikidata sur un échantillon de joueurs du Top 14 et de la Pro D2.

## 6. Où regarder

Ordre de résolution du **Diffuseur** d'un Match, du plus prioritaire au moins prioritaire :

1. **Correction de diffusion** : un fichier du dépôt (ex. `data/corrections-diffusion.json`), modifiable à la main depuis l'app GitHub. Elle l'emporte toujours.
2. **Gemini** : environ 7 jours avant le Match (puis rafraîchi à J-1), la tâche demande à Gemini le ou les Diffuseurs en France :
   - avec une sortie structurée et les URL sources ;
   - la réponse est validée contre une liste connue de Diffuseurs (Canal+, France 2, France 3, France TV, TF1, L'Équipe TV, beIN Sports, Rugby+…) ;
   - le résultat est stocké ; on ne réinterroge pas Gemini à chaque collecte.
3. **Règle de diffusion** : le Diffuseur habituel de la Compétition, défini dans un fichier de configuration du dépôt.

L'app affiche le Diffuseur et sa provenance (corrigé, trouvé avec sources, ou habituel). Elle respecte les obligations d'affichage liées au grounding Google (liens sources).

## 7. Résumés

- Après chaque Match terminé, la tâche lit les flux RSS (15 dernières vidéos) des Chaînes officielles concernées : LNR / Top 14 / Pro D2, EPCR, Six Nations Rugby, World Rugby, FFR, Canal+ Sport.
- Elle retient la vidéo dont le titre contient les deux équipes (avec une correspondance tolérante sur les noms), publiée après le coup d'envoi.
- Elle vérifie via oEmbed si la vidéo est intégrable :
  - si oui, le lecteur YouTube est intégré dans la Page match. Le compte YouTube connecté dans le navigateur s'applique naturellement (historique, Premium), sans connexion côté app ;
  - sinon, l'app affiche un lien vers YouTube.
- S'il n'y a aucun Résumé (cas fréquent pour le Top 14, dont les droits sont chez Canal+), l'app affiche un bouton « Voir sur Canal+ » ou vers le Diffuseur.
- La recherche s'arrête quelques jours après le Match si rien n'est trouvé.

## 8. Écrans

### Accueil

- « Mes matchs » en tête (prochains Matchs et derniers Scores finaux des Équipes favorites), si des favoris sont définis.
- Prochains Matchs (date, heure, Compétition, Diffuseur).
- Derniers Scores finaux.

### Calendrier

- Toute la saison en cours.
- Filtres par Compétition et par équipe.
- Regroupé par journée ou par date.

### Page match

- Équipes et logos, date et heure, lieu si disponible, Diffuseur avec provenance.
- Score final.
- Feuille de match (titulaires et remplaçants) et marqueurs. Chaque nom de Joueur mène à sa fiche.
- Résumé (vidéo intégrée, lien, ou bouton vers le Diffuseur).

### Page équipe

- Logo, Compétitions, prochains Matchs et derniers résultats.
- Effectif (Joueurs ayant une fiche).
- Bouton ajouter ou retirer des Équipes favorites.

### Fiche joueur

- Nom, poste, club actuel, sélection, âge, photo si disponible.
- **Parcours** : frise chronologique par club et par sélection, avec les saisons. Si Wikidata ne connaît pas le Joueur, la frise montre seulement le club actuel (« depuis la saison X » si connu), sans message d'erreur.
- **Stats de saison** :
  - de base, toujours présentes : matchs joués, titularisations, essais, points ;
  - avancées, affichées seulement si la source les fournit : plaquages, mètres parcourus, franchissements, turnovers.
- Liste de ses Matchs de la saison : titulaire ou remplaçant, essais.

### Classements

- Un classement par Compétition (avec les poules quand il y en a).

### Recherche

- Recherche de Joueurs par nom, et d'équipes.

## 9. Règles métier

- Un **Joueur** n'a une fiche que s'il figure sur au moins une Feuille de match d'un Match suivi.
- Les Stats de saison sont calculées par l'app à partir des Feuilles de match collectées.
- Au premier lancement, la tâche rattrape tous les Matchs déjà joués de la saison 2026-27. Les stats s'accumulent ensuite saison après saison. Les saisons antérieures n'ont pas de stats, seulement le Parcours.
- Une **Équipe favorite** est stockée sur l'appareil, sans synchronisation entre appareils.

## 10. Critères d'acceptation V1

- [ ] Le site est publié sur GitHub Pages, installable sur l'écran d'accueil d'un iPhone et d'un Android.
- [ ] Toutes les Compétitions du §2 apparaissent au Calendrier, avec les horaires en heure de Paris (Pro D2 sous réserve du spike).
- [ ] Chaque Match à venir affiche un Diffuseur et sa provenance. Une Correction de diffusion poussée dans le dépôt apparaît au déploiement suivant.
- [ ] Un Score final apparaît dans l'heure qui suit la fin d'un Match.
- [ ] Les Résumés EPCR s'affichent en vidéo intégrée. Un Match sans Résumé intégrable affiche un lien ou le bouton du Diffuseur.
- [ ] Une Fiche joueur affiche le Parcours (quand Wikidata l'a) et les Stats de saison de base depuis le début de la saison 2026-27.
- [ ] Les Classements de chaque Compétition sont affichés.
- [ ] Les Équipes favorites persistent sur l'appareil et alimentent « Mes matchs ».
- [ ] Aucune clé API n'apparaît dans le site publié ni dans l'historique du dépôt.
