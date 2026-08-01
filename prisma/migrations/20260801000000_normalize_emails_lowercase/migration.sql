-- Normalisation des adresses email en minuscules.
--
-- ── POURQUOI ────────────────────────────────────────────────────────────────
--
-- `signup` enregistrait l'adresse telle que saisie et `authorize()` la
-- recherchait telle que saisie. Une inscription « Awa@boutique.ci » ne pouvait
-- donc pas se connecter en tapant « awa@boutique.ci », et rien n'empêchait de
-- créer deux comptes pour la même adresse à la casse près — la contrainte
-- d'unicité ne voyant que deux chaînes distinctes.
--
-- Les schémas Zod normalisent désormais à l'entrée. Cette migration met les
-- lignes existantes en accord avec cette règle, puis la fait porter par la base
-- elle-même.
--
-- `updated_at` n'est volontairement pas touché : ce n'est pas la personne qui a
-- modifié son compte, et le faire mentirait sur l'historique.
-- ────────────────────────────────────────────────────────────────────────────

-- ─── 1. Users : refuser d'agir plutôt que de choisir à la place d'un humain ──
--
-- Deux comptes distincts qui deviennent identiques une fois en minuscules ne
-- peuvent pas être départagés par une migration : fusionner ou renommer engage
-- des données réelles (commandes, rôle, boutique). On interrompt donc en
-- nommant les adresses concernées. C'est aussi le bon moment pour le faire :
-- déployer le code normalisé sans les traiter rendrait ces connexions
-- imprévisibles.
DO $$
DECLARE
  colliding text;
BEGIN
  SELECT string_agg(e, ', ' ORDER BY e)
    INTO colliding
    FROM (
      SELECT lower(btrim(email)) AS e
        FROM users
       GROUP BY lower(btrim(email))
      HAVING count(*) > 1
    ) AS dups;

  IF colliding IS NOT NULL THEN
    RAISE EXCEPTION
      'Normalisation impossible : plusieurs comptes deviendraient identiques une fois l''adresse mise en minuscules (%). Fusionnez ou renommez ces comptes à la main, puis relancez la migration.',
      colliding;
  END IF;
END
$$;

UPDATE users
   SET email = lower(btrim(email))
 WHERE email <> lower(btrim(email));

-- ─── 2. Invitations : résoudre les collisions, ici c'est sans risque ─────────
--
-- `invitations_tenant_email_unique` est une contrainte partielle sur
-- (tenant_id, email) limitée aux invitations non consommées. La normalisation
-- peut donc faire entrer en collision deux invitations en attente adressées à
-- la même personne sur la même boutique, à la casse près.
--
-- Contrairement aux comptes, trancher ici ne détruit rien : une seconde
-- invitation en attente vers la même adresse est redondante par construction —
-- le routeur refuse d'ailleurs déjà d'en créer une. On conserve la plus
-- récente et on marque les autres comme consommées, ce qui invalide leur jeton
-- sans supprimer la trace.
UPDATE invitations
   SET consumed_at = NOW()
 WHERE id IN (
   SELECT id
     FROM (
       SELECT id,
              row_number() OVER (
                PARTITION BY tenant_id, lower(btrim(email))
                ORDER BY created_at DESC, id DESC
              ) AS rn
         FROM invitations
        WHERE consumed_at IS NULL
     ) AS ranked
    WHERE rn > 1
 );

UPDATE invitations
   SET email = lower(btrim(email))
 WHERE email <> lower(btrim(email));

-- ─── 3. La règle devient une garantie de la base ────────────────────────────
--
-- `users_email_key` porte sur la colonne brute : il laisse coexister
-- « Foo@x.com » et « foo@x.com ». Cet index-ci l'interdit quoi qu'écrive le
-- code applicatif — c'est précisément ce qui manquait, la règle n'ayant tenu
-- jusqu'ici qu'à ce que trois chemins d'écriture s'en souviennent.
--
-- Créé en SQL brut car Prisma ne sait pas exprimer un index sur expression,
-- comme `invitations_tenant_email_unique` avant lui. Une note dans
-- `schema.prisma` le signale, pour qu'il ne disparaisse pas à la prochaine
-- migration générée.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key
    ON users (lower(email));
