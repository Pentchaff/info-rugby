# L'API non officielle d'ESPN comme source principale des matchs et des joueurs

API-Sports Rugby, la source « évidente », n'ouvre pas la saison en cours dans son offre gratuite et ne fournit aucune donnée joueur. On utilise donc l'API publique mais non documentée d'ESPN (gratuite, sans clé), qui couvre les compétitions suivies, compositions incluses. Elle peut changer sans préavis : la collecte isole donc la source derrière un adaptateur.

**Conséquence** : ESPN ne couvre pas la Pro D2. Plutôt que de payer API-Sports (refusé : l'app doit rester à 0 €) ou de récupérer le site de la LNR (fragile, conditions d'utilisation), la Pro D2 est retirée de la V1. Elle reste dans `config/competitions.json` avec `enabled: false`, pour la réactiver si une source gratuite apparaît.
