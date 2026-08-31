# Factur-X Viewer — extension VS Code

## Objectif

Extension VS Code permettant d'ouvrir un PDF Factur-X et d'afficher **côte à côte** :
- le rendu du PDF,
- le XML CII (Cross Industry Invoice) qui y est embarqué,

avec **validation du XML contre le schéma Factur-X** (XSD) et possibilité de **modifier ce XML**.

Portée actuelle : usage exclusivement au sein de VS Code (pas de CLI, pas de service web séparé) dans un premier temps.

## Contexte métier

Factur-X (norme franco-allemande, alignée EN 16931 / UN/CEFACT CII) est un format de facture électronique hybride : un PDF/A-3 conforme contenant, en pièce jointe embarquée, un fichier XML structuré (`factur-x.xml` généralement) qui porte les données de facturation lisibles par machine. Le PDF reste lisible par un humain, le XML est le contenu faisant foi pour le traitement automatisé.

Profils Factur-X (du plus simple au plus complet) : MINIMUM, BASIC WL, BASIC, EN 16931 (COMFORT), EXTENDED. Chaque profil a son propre XSD (dérivé du schéma CII D16B). La validation doit identifier le profil déclaré dans le XML et appliquer le XSD correspondant.

## Fonctionnalités visées

1. **Ouverture d'un PDF Factur-X**
   - Extraction du XML embarqué (pièce jointe du PDF/A-3) sans dépendance externe lourde.
   - Détection du profil Factur-X déclaré (`rsm:CrossIndustryInvoice` → `ExchangedDocumentContext` → paramètre de guide).

2. **Vue côte à côte**
   - Panneau gauche : rendu du PDF (pagination, zoom).
   - Panneau droit : éditeur XML avec coloration syntaxique, pliage, et si possible auto-complétion/hints basés sur le XSD.
   - Synchronisation minimale utile : pas d'obligation de scroll-sync page ↔ XML dans une v1.

3. **Validation de schéma**
   - Validation XSD du XML contre le schéma correspondant au profil détecté.
   - Affichage des erreurs de validation dans le panneau "Problems" de VS Code (diagnostics), avec ligne/colonne quand disponible.
   - Schémas XSD Factur-X embarqués dans l'extension (vérifier la licence de redistribution FNFE-MPE avant de les committer).

4. **Édition du XML**
   - Édition libre du texte XML dans le panneau droit.
   - Revalidation à la volée (debounced) contre le XSD.
   - Sauvegarde : ré-injection du XML modifié dans le PDF en remplaçant la pièce jointe existante (le PDF visuel n'est pas régénéré, seul l'attachment XML change).
   - Point de vigilance explicite : préserver au mieux la conformité PDF/A-3 (métadonnées XMP, flux non chiffré) lors de la ré-écriture ; documenter les limites si une conformité stricte n'est pas garantie.

## Architecture technique proposée

- **Type d'extension** : Custom Editor (webview-based), `viewType` dédié, activé sur les fichiers `.pdf` (avec possibilité de coexister avec la visionneuse PDF par défaut de VS Code — l'utilisateur choisit l'éditeur).
- **Extension host (Node/TypeScript)** :
  - Lecture du PDF et extraction de la pièce jointe embarquée → `pdf-lib` (ou `pdfjs-dist` pour la lecture d'attachments) comme point de départ.
  - Validation XSD → `xmllint-wasm` (xmllint compilé en WebAssembly), exécuté côté extension host, pas dans la webview.
  - Écriture de la pièce jointe modifiée dans le PDF → `pdf-lib`.
- **Webview** :
  - Rendu PDF via `pdf.js`.
  - Édition XML via Monaco (bundlé) ou délégation à un `TextDocument` VS Code standard si on préfère un vrai onglet éditeur pour le XML plutôt qu'un widget dans la webview (à trancher — impact sur l'UX de sauvegarde/diagnostics).
- **Diagnostics** : `vscode.languages.createDiagnosticCollection` pour remonter les erreurs XSD comme des diagnostics standards.

## Décisions ouvertes (à trancher au fil du développement)

- Éditeur XML : widget Monaco dans la webview vs. document VS Code natif ouvert en parallèle (impacte la simplicité de sauvegarde et l'intégration avec les diagnostics).
- Stratégie de re-génération du PDF/A-3 après édition (fidélité de conformité).
- Gestion des PDF sans XML embarqué (comportement de fallback : proposer la vue PDF standard, ou vue vide + bouton "attacher un XML").
- Packaging des XSD Factur-X (licence, versionnement des profils/millésimes CII D16B/D22B).

## Stack

- TypeScript, API extension VS Code standard.
- Empaquetage : `vsce` pour générer le `.vsix` (usage local dans VS Code pour l'instant, pas de publication sur le Marketplace prévue à ce stade).

## Non-objectifs (v1)

- Pas de génération de facture Factur-X from scratch.
- Pas d'intégration avec un ERP/comptabilité.
- Pas de mode CLI/headless.
