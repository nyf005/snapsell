# Vérifications restantes après les correctifs

Les correctifs et leurs tests sont inclus dans ce commit. L’audit reste partiel.

1. **CI et déploiement** : obtenir un passage complet vert de la CI (la dernière exécution locale avait 1440 succès et 3 erreurs de mock, ensuite corrigées avec 12 tests ciblés verts). Vérifier le SHA réellement servi par Vercel et le worker Railway, puis les parcours invitations/WhatsApp après déploiement. Un push ne prouve pas le déploiement.
2. **Configuration production en lecture seule** : vérifier NODE_ENV, présence des secrets Meta/Paystack/QStash/cron, activation Redis du limiteur, permissions DB, confidentialité du bucket R2 et des preuves, accès aux logs. Ne pas exporter les valeurs de secrets.
3. **Parcours navigateur avec deux boutiques de test** : accès croisés aux commandes/conversations/preuves, rôles OWNER/MANAGER/AGENT/OPS, révocation de session, invitation avec mauvais compte, connexion/déconnexion/reconnexion WhatsApp. Pas de paiement réel ni mutation de production.
4. **Scénarios concurrents supplémentaires** : réaffectation ou promotion OPS du destinataire entre lecture et acceptation, expiration/consommation du même jeton pendant la transaction, double renouvellement des crédits et renouvellement Paystack du même plan. Les trois courses de places et les trois snapshots crédits déjà testés ne couvrent pas tous ces scénarios.
5. **Couverture source restante** : comparer les chemins de coverage.json du rapport aux points d’entrée/services non encore lus intégralement ; notamment chemins secondaires des workers/commandes, adaptation Meta, reconnexion et jobs de synchronisation anciens. Chaque surface doit avoir une conclusion ou une exclusion justifiée.
6. **Secrets et autorité support** : examiner l’historique Git avec un détecteur dédié (le contrôle effectué couvrait quelques motifs dans les fichiers suivis actuels), vérifier la migration des anciens tokens Meta en clair et sécuriser le provisionnement des adresses support (email auto-déclaré à l’inscription). Le numéro exige désormais un jeton Meta valide.

Pour clôturer : consigner les preuves de ces contrôles, les risques résiduels acceptés et la révision déployée. Aucun audit ne garantit l’absence absolue de faille.
