// Tradiksyon mesaj sèvè a (erè + notifikasyon) an Fransè ak Anglè.
//
// Tout wout yo kontinye ekri mesaj yo an Kreyòl jan yo te ye a. Middleware
// `translateResponses` la (nan index.js) entèsepte chak repons JSON epi
// tradui `error` ak `notifications[].title/body` selon lang kliyan an voye
// nan header `X-BLIC-Lang` (ht | fr | en). San header sa a → Kreyòl, kidonk
// sit web ak panèl admin ki poko voye l yo pa chanje ditou.
//
// Chak antre: [Kreyòl, Fransè, Anglè]. {0}, {1}... se pati ki chanje (non,
// montan, dat...). Si yon pati se li menm yon tèks ki nan diksyonè a (egz.
// "Prèv adrès"), li tradui tou.

const ENTRIES = [
  // ---------- Koneksyon / kont ----------
  ['Ou dwe konekte pou fè sa a.', 'Vous devez être connecté pour faire cela.', 'You must be signed in to do this.'],
  ['Sesyon an ekspire — konekte ankò.', 'Session expirée — reconnectez-vous.', 'Session expired — please sign in again.'],
  ['Aksè refize — sa se pou admin sèlman.', 'Accès refusé — réservé aux administrateurs.', 'Access denied — admins only.'],
  ['Aksè refize — sa se pou admin oswa ajan sèlman.', 'Accès refusé — réservé aux administrateurs et agents.', 'Access denied — admins and agents only.'],
  ['Ou dwe verifye kont ou (KYC) anvan ou ka fè sa a.', 'Vous devez vérifier votre compte (KYC) avant de faire cela.', 'You must verify your account (KYC) before doing this.'],
  ['Kle sekrè a manke oswa li pa valab.', 'Clé secrète manquante ou invalide.', 'Secret key missing or invalid.'],
  ['Kle sekrè a pa valab.', 'Clé secrète invalide.', 'Invalid secret key.'],
  ['Non, nimewo telefòn, ak yon modpas (6+ karaktè) obligatwa.', 'Le nom, le numéro de téléphone et un mot de passe (6+ caractères) sont obligatoires.', 'Name, phone number and a password (6+ characters) are required.'],
  ['Yon kont deja egziste ak nimewo sa a.', 'Un compte existe déjà avec ce numéro.', 'An account already exists with this number.'],
  ['Nimewo oswa modpas la pa kòrèk.', 'Numéro ou mot de passe incorrect.', 'Incorrect phone number or password.'],
  ['Imèl oswa modpas la pa kòrèk.', 'E-mail ou mot de passe incorrect.', 'Incorrect email or password.'],
  ['Kont sa a bloke. Kontakte sipò BLICPay.', 'Ce compte est bloqué. Contactez le support BLICPay.', 'This account is blocked. Contact BLICPay support.'],
  ['Modpas aktyèl la ak nouvo modpas la obligatwa.', 'Le mot de passe actuel et le nouveau mot de passe sont obligatoires.', 'Current and new passwords are required.'],
  ['Nouvo modpas la dwe gen omwen 6 karaktè.', 'Le nouveau mot de passe doit contenir au moins 6 caractères.', 'The new password must be at least 6 characters.'],
  ['Nouvo modpas la dwe diferan de ansyen an.', "Le nouveau mot de passe doit être différent de l'ancien.", 'The new password must be different from the old one.'],
  ['Modpas aktyèl la pa kòrèk.', 'Le mot de passe actuel est incorrect.', 'The current password is incorrect.'],
  ['Modpas la dwe gen omwen 6 karaktè.', 'Le mot de passe doit contenir au moins 6 caractères.', 'Password must be at least 6 characters.'],
  ['Modpas la pa kòrèk.', 'Mot de passe incorrect.', 'Incorrect password.'],
  ['Modpas kont ou obligatwa pou konfime.', 'Le mot de passe de votre compte est obligatoire pour confirmer.', 'Your account password is required to confirm.'],
  ['Kont lan pa jwenn.', 'Compte introuvable.', 'Account not found.'],
  ['Itilizatè a pa jwenn.', 'Utilisateur introuvable.', 'User not found.'],
  ['Yon kont deja itilize imèl sa a.', 'Un compte utilise déjà cet e-mail.', 'An account already uses this email.'],
  ['Yon kont deja itilize telefòn sa a.', 'Un compte utilise déjà ce téléphone.', 'An account already uses this phone number.'],
  ['Yon lòt kont deja itilize imèl sa a.', 'Un autre compte utilise déjà cet e-mail.', 'Another account already uses this email.'],
  ['Yon lòt kont deja itilize telefòn sa a.', 'Un autre compte utilise déjà ce téléphone.', 'Another account already uses this phone number.'],
  ['Twòp tantativ konneksyon — tann kèk minit epi eseye ankò.', 'Trop de tentatives de connexion — attendez quelques minutes et réessayez.', 'Too many sign-in attempts — wait a few minutes and try again.'],
  ['Twòp demand verifikasyon — tann yon ti moman epi eseye ankò.', 'Trop de demandes de vérification — patientez un moment et réessayez.', 'Too many verification requests — wait a moment and try again.'],
  ['Yon bagay pa mache — eseye ankò pita.', "Une erreur s'est produite — réessayez plus tard.", 'Something went wrong — please try again later.'],

  // ---------- PIN ----------
  ['Kòd PIN la dwe gen egzakteman 4 chif.', 'Le code PIN doit contenir exactement 4 chiffres.', 'The PIN must be exactly 4 digits.'],
  ['Kòd PIN 4 chif la obligatwa.', 'Le code PIN à 4 chiffres est obligatoire.', 'The 4-digit PIN is required.'],
  ['Kòd PIN la pa kòrèk.', 'Code PIN incorrect.', 'Incorrect PIN.'],
  ['Ou poko gen yon kòd PIN kreye.', "Vous n'avez pas encore créé de code PIN.", "You haven't created a PIN yet."],
  ['Ou dwe kreye yon kòd PIN anvan ou ka fè yon retrè.', 'Vous devez créer un code PIN avant de faire un retrait.', 'You must create a PIN before making a withdrawal.'],

  // ---------- Montan / balans ----------
  ['Dat yo pa valab.', 'Dates invalides.', 'Invalid dates.'],
  ['Foto a pa valab.', 'Photo invalide.', 'Invalid photo.'],
  ['Foto a twò gwo.', 'La photo est trop lourde.', 'The photo is too large.'],
  ['Montan an pa valab.', 'Montant invalide.', 'Invalid amount.'],
  ['Ou pa gen ase lajan.', "Vous n'avez pas assez d'argent.", "You don't have enough money."],
  ['Ou pa gen ase lajan pou transfè sa a.', "Vous n'avez pas assez d'argent pour ce transfert.", "You don't have enough money for this transfer."],
  ['Ou pa gen ase lajan pou peman sa a.', "Vous n'avez pas assez d'argent pour ce paiement.", "You don't have enough money for this payment."],
  ['Ou pa gen ase lajan pou vèsman sa a.', "Vous n'avez pas assez d'argent pour ce versement.", "You don't have enough money for this installment."],
  ['Ou pa gen ase nan kont prensipal la.', "Vous n'avez pas assez sur le compte principal.", "You don't have enough in your main account."],
  ['Ou pa gen ase lajan pou peye frè entegrasyon an ({0} HTG).', "Vous n'avez pas assez d'argent pour payer les frais d'intégration ({0} HTG).", "You don't have enough money to pay the integration fee ({0} HTG)."],
  ['Ou pa gen ase lajan — retrè sa a mande {0} HTG (montan + {1} HTG frè).', "Vous n'avez pas assez d'argent — ce retrait nécessite {0} HTG (montant + {1} HTG de frais).", "You don't have enough money — this withdrawal requires {0} HTG (amount + {1} HTG fee)."],
  ['Balans lan pa ka pase anba 0.', 'Le solde ne peut pas être négatif.', 'The balance cannot go below 0.'],
  ['Balans lan pa valab.', 'Solde invalide.', 'Invalid balance.'],

  // ---------- Transfè / peman ----------
  ['ID kliyan destinatè a obligatwa.', "L'ID client du destinataire est obligatoire.", "The recipient's client ID is required."],
  ['Pa gen okenn kont BLICPay ak ID sa a.', "Aucun compte BLICPay n'a cet ID.", 'No BLICPay account has this ID.'],
  ['Ou pa ka voye lajan bay tèt ou.', "Vous ne pouvez pas vous envoyer de l'argent.", "You can't send money to yourself."],
  ['Peman sa a pa jwenn.', 'Paiement introuvable.', 'Payment not found.'],
  ['Peman sa a deja trete.', 'Ce paiement a déjà été traité.', 'This payment has already been processed.'],
  ['Yon referans obligatwa.', 'Une référence est obligatoire.', 'A reference is required.'],
  ['Kont marchan an pa jwenn.', 'Compte marchand introuvable.', 'Merchant account not found.'],
  ['Non biznis, imèl, ak yon modpas (6+ karaktè) obligatwa.', "Le nom de l'entreprise, l'e-mail et un mot de passe (6+ caractères) sont obligatoires.", 'Business name, email and a password (6+ characters) are required.'],
  ['Yon kont marchan deja egziste ak imèl sa a.', 'Un compte marchand existe déjà avec cet e-mail.', 'A merchant account already exists with this email.'],

  // ---------- Depo ----------
  ['Metòd depo a pa rekonèt.', 'Méthode de dépôt non reconnue.', 'Unrecognized deposit method.'],
  ['Chwazi yon siikisal.', 'Choisissez une succursale.', 'Choose a branch.'],
  ['Montan minimòm pou yon depo se {0} HTG.', 'Le montant minimum pour un dépôt est de {0} HTG.', 'The minimum deposit amount is {0} HTG.'],
  ['Depo a pa jwenn.', 'Dépôt introuvable.', 'Deposit not found.'],
  ['Depo sa a deja trete.', 'Ce dépôt a déjà été traité.', 'This deposit has already been processed.'],
  ['ID tranzaksyon an obligatwa.', "L'ID de transaction est obligatoire.", 'The transaction ID is required.'],
  ['Foto resi a obligatwa.', 'La photo du reçu est obligatoire.', 'The receipt photo is required.'],
  ['Resi sa a deja itilize pou yon lòt depo — ou pa ka sèvi avè l ankò.', 'Ce reçu a déjà été utilisé pour un autre dépôt — vous ne pouvez plus l’utiliser.', 'This receipt was already used for another deposit — you cannot use it again.'],
  ['ID tranzaksyon ou tape a pa koresponn ak sa nou jwenn nan resi a. Verifye epi eseye ankò.', "L'ID de transaction saisi ne correspond pas à celui du reçu. Vérifiez et réessayez.", "The transaction ID you entered doesn't match the receipt. Check and try again."],
  ['Montan ou tape a ({0} HTG) pa parèt nan resi a. Verifye ou mete montan REYÈL ou voye a.', "Le montant saisi ({0} HTG) n'apparaît pas sur le reçu. Vérifiez que vous avez entré le montant RÉEL envoyé.", "The amount you entered ({0} HTG) doesn't appear on the receipt. Make sure you entered the ACTUAL amount sent."],
  ['Depo MonCash yo konfime otomatikman — yo pa ka konfime alamen. Si li rete "pending", se paske peman an poko fini.', 'Les dépôts MonCash sont confirmés automatiquement — ils ne peuvent pas être confirmés manuellement. S\'il reste "pending", le paiement n\'est pas encore terminé.', 'MonCash deposits are confirmed automatically — they cannot be confirmed manually. If it stays "pending", the payment is not finished yet.'],

  // ---------- Retrè ----------
  ['Metòd retrè a pa rekonèt.', 'Méthode de retrait non reconnue.', 'Unrecognized withdrawal method.'],
  ['Montan minimòm pou yon retrè se {0} HTG.', 'Le montant minimum pour un retrait est de {0} HTG.', 'The minimum withdrawal amount is {0} HTG.'],
  ['Ou depase plafon retrè pa jou a ({0} HTG). Ou ka retire {1} HTG anplis jodi a.', "Vous dépassez le plafond de retrait journalier ({0} HTG). Vous pouvez encore retirer {1} HTG aujourd'hui.", 'You exceeded the daily withdrawal limit ({0} HTG). You can withdraw {1} HTG more today.'],
  ['Ou depase plafon retrè pa semèn nan ({0} HTG).', 'Vous dépassez le plafond de retrait hebdomadaire ({0} HTG).', 'You exceeded the weekly withdrawal limit ({0} HTG).'],
  ['Ou depase plafon retrè pa mwa a ({0} HTG).', 'Vous dépassez le plafond de retrait mensuel ({0} HTG).', 'You exceeded the monthly withdrawal limit ({0} HTG).'],
  ['Retrè a pa jwenn.', 'Retrait introuvable.', 'Withdrawal not found.'],
  ['Retrè sa a deja trete.', 'Ce retrait a déjà été traité.', 'This withdrawal has already been processed.'],
  ['Ou dwe telechaje yon prèv (foto resi/tranzaksyon) anvan ou konfime nenpòt retrè.', 'Vous devez téléverser une preuve (photo du reçu/transaction) avant de confirmer un retrait.', 'You must upload proof (receipt/transaction photo) before confirming any withdrawal.'],

  // ---------- Siikisal / ajan / rezèv ----------
  ['Non siikisal la obligatwa.', 'Le nom de la succursale est obligatoire.', 'Branch name is required.'],
  ['Yon siikisal deja gen non sa a.', 'Une succursale porte déjà ce nom.', 'A branch already has this name.'],
  ['Yon lòt siikisal deja gen non sa a.', 'Une autre succursale porte déjà ce nom.', 'Another branch already has this name.'],
  ['Siikisal sa a pa jwenn.', 'Succursale introuvable.', 'Branch not found.'],
  ['Siikisal sa a pa egziste.', "Cette succursale n'existe pas.", "This branch doesn't exist."],
  ['Siikisal sa a pa egziste — kreye l anvan.', "Cette succursale n'existe pas — créez-la d'abord.", "This branch doesn't exist — create it first."],
  ['Gen {0} ajan ki toujou nan siikisal sa a — deplase oswa efase yo anvan.', "{0} agent(s) sont encore dans cette succursale — déplacez-les ou supprimez-les d'abord.", '{0} agent(s) are still in this branch — move or delete them first.'],
  ['Non, telefòn, modpas, ak biwo obligatwa.', 'Le nom, le téléphone, le mot de passe et le bureau sont obligatoires.', 'Name, phone, password and branch are required.'],
  ['Non, telefòn, ak biwo obligatwa.', 'Le nom, le téléphone et le bureau sont obligatoires.', 'Name, phone and branch are required.'],
  ['Ajan sa a pa jwenn.', 'Agent introuvable.', 'Agent not found.'],
  ['Metòd sa a pa sipòte pou rezèv.', "Cette méthode n'est pas prise en charge pour les réserves.", 'This method is not supported for reserves.'],
  ['Yon rezon obligatwa pou yon ajisteman manyèl.', 'Une raison est obligatoire pour un ajustement manuel.', 'A reason is required for a manual adjustment.'],
  ['Yon rezon obligatwa pou refize.', 'Une raison est obligatoire pour refuser.', 'A reason is required to reject.'],

  // ---------- Objektif / pòch ----------
  ['Yon tit obligatwa.', 'Un titre est obligatoire.', 'A title is required.'],
  ['Sib la pa valab.', 'Objectif invalide.', 'Invalid target.'],
  ['Objektif la pa jwenn.', 'Objectif introuvable.', 'Goal not found.'],
  ['Objektif sa a pa aktif ankò.', "Cet objectif n'est plus actif.", 'This goal is no longer active.'],
  ['Objektif sa a deja retire.', 'Cet objectif a déjà été retiré.', 'This goal has already been withdrawn.'],
  ['Objektif sa a poko atenn — sèvi ak retrè ijans si ou vle retire l kanmenm.', "Cet objectif n'est pas encore atteint — utilisez le retrait d'urgence si vous voulez le retirer quand même.", "This goal hasn't been reached yet — use emergency withdrawal if you want to withdraw it anyway."],
  ['Bay pòch la yon non.', 'Donnez un nom à la poche.', 'Give the pocket a name.'],
  ['Pòch la pa jwenn.', 'Poche introuvable.', 'Pocket not found.'],
  ['Pòch destinasyon an pa jwenn.', 'Poche de destination introuvable.', 'Destination pocket not found.'],
  ['Pa gen ase lajan nan pòch sa a.', "Il n'y a pas assez d'argent dans cette poche.", "There isn't enough money in this pocket."],

  // ---------- Prè ----------
  ['Fonksyonalite Prè a poko disponib — l ap vini talè.', "La fonctionnalité Prêt n'est pas encore disponible — elle arrive bientôt.", "Loans aren't available yet — coming soon."],
  ['Plan prè a pa valab.', 'Plan de prêt invalide.', 'Invalid loan plan.'],
  ['Ou gen yon prè an kou deja.', 'Vous avez déjà un prêt en cours.', 'You already have a loan in progress.'],
  ['Kont ou pa ka mande yon prè ankò — kontakte sipò BLICPay.', 'Votre compte ne peut plus demander de prêt — contactez le support BLICPay.', 'Your account can no longer request a loan — contact BLICPay support.'],
  ['Prè a pa jwenn.', 'Prêt introuvable.', 'Loan not found.'],
  ['Prè sa a deja trete.', 'Ce prêt a déjà été traité.', 'This loan has already been processed.'],
  ['Prè sa a pa aktif.', "Ce prêt n'est pas actif.", 'This loan is not active.'],
  ['Tout vèsman yo deja peye.', 'Tous les versements sont déjà payés.', 'All installments are already paid.'],
  ['Vèsman sa a deja peye.', 'Ce versement est déjà payé.', 'This installment is already paid.'],

  // ---------- Sòl ----------
  ['Kont ou pa ka patisipe nan Sòl ankò — kontakte sipò BLICPay.', 'Votre compte ne peut plus participer au Sòl — contactez le support BLICPay.', 'Your account can no longer join Sòl — contact BLICPay support.'],
  ['Gwoup sa a pa jwenn.', 'Groupe introuvable.', 'Group not found.'],
  ['Gwoup sa a konplè.', 'Ce groupe est complet.', 'This group is full.'],
  ['Gwoup sa a konplè deja — pa ka apwouve ankò.', 'Ce groupe est déjà complet — impossible d’approuver davantage.', 'This group is already full — no more approvals possible.'],
  ['Gwoup la poko plen — pozisyon {0} pa gen okenn manm.', "Le groupe n'est pas encore complet — la ou les positions {0} n'ont aucun membre.", 'The group is not full yet — position(s) {0} have no member.'],
  ['Sòl {0} #{1} dwe ranpli anvan.', "Le Sòl {0} #{1} doit d'abord être complété.", 'Sòl {0} #{1} must be filled first.'],
  ['Ou deja gen yon demand oswa ou deja manm gwoup sa a.', 'Vous avez déjà une demande ou êtes déjà membre de ce groupe.', 'You already have a request or are already a member of this group.'],
  ['Demand sa a pa jwenn.', 'Demande introuvable.', 'Request not found.'],
  ['Demand sa a deja trete.', 'Cette demande a déjà été traitée.', 'This request has already been processed.'],
  ['Demand sa a deja trete — ou pa ka peye frè a ankò.', 'Cette demande a déjà été traitée — vous ne pouvez plus payer les frais.', 'This request has already been processed — you can no longer pay the fee.'],
  ['Ou deja peye frè entegrasyon an pou demand sa a.', "Vous avez déjà payé les frais d'intégration pour cette demande.", 'You already paid the integration fee for this request.'],
  ['Kliyan an poko peye frè entegrasyon li a — ou pa ka apwouve toujou.', "Le client n'a pas encore payé ses frais d'intégration — vous ne pouvez pas encore approuver.", "The client hasn't paid the integration fee yet — you can't approve yet."],
  ['Adezyon sa a pa jwenn.', 'Adhésion introuvable.', 'Membership not found.'],
  ['Manm sa a pa jwenn.', 'Membre introuvable.', 'Member not found.'],
  ['Pozisyon an pa valab.', 'Position invalide.', 'Invalid position.'],
  ['Pozisyon sa a deja plen.', 'Cette position est déjà occupée.', 'This position is already filled.'],
  ['Pozisyon sa a deja pran pa yon lòt manm.', 'Cette position est déjà prise par un autre membre.', 'This position is already taken by another member.'],
  ['Pozisyon 1 a {0} rete vid espre — pa gen manm ki ka mete la.', 'Les positions 1 à {0} restent volontairement vides — aucun membre ne peut y être placé.', 'Positions 1 to {0} are intentionally left empty — no member can be placed there.'],
  ['Wotasyon sa a deja kòmanse.', 'Cette rotation a déjà commencé.', 'This rotation has already started.'],
  ['Wotasyon sa a poko kòmanse.', "Cette rotation n'a pas encore commencé.", "This rotation hasn't started yet."],
  ['Wotasyon sa a fini deja.', 'Cette rotation est déjà terminée.', 'This rotation is already finished.'],
  ['Tit, dokiman an, ak kalite fichye a obligatwa.', 'Le titre, le document et le type de fichier sont obligatoires.', 'Title, document and file type are required.'],
  ['Dokiman an pa jwenn.', 'Document introuvable.', 'Document not found.'],

  // ---------- KYC / verifikasyon ----------
  ['Tout chan yo obligatwa: docType, docImage, docMimeType, selfieImage, selfieMimeType', 'Tous les champs sont obligatoires : docType, docImage, docMimeType, selfieImage, selfieMimeType', 'All fields are required: docType, docImage, docMimeType, selfieImage, selfieMimeType'],
  ['docType envalid. Itilize: paspò, CIN, oswa lisans', 'docType invalide. Utilisez : paspò, CIN ou lisans', 'Invalid docType. Use: paspò, CIN or lisans'],
  ['Soumisyon an pa jwenn.', 'Soumission introuvable.', 'Submission not found.'],
  ['Soumisyon sa a deja trete.', 'Cette soumission a déjà été traitée.', 'This submission has already been processed.'],
  ['Verifikasyon an pa jwenn.', 'Vérification introuvable.', 'Verification not found.'],
  ['Verifikasyon sa a deja trete.', 'Cette vérification a déjà été traitée.', 'This verification has already been processed.'],
  ['Nou pa t kapab kòmanse verifikasyon an — eseye ankò pita.', 'Impossible de démarrer la vérification — réessayez plus tard.', "We couldn't start the verification — please try again later."],
  ['Nou pa t ka kontakte Didit — eseye ankò.', 'Impossible de contacter Didit — réessayez.', "We couldn't reach Didit — please try again."],
  ['Nou pa t ka jwenn estati verifikasyon an.', 'Impossible de récupérer le statut de la vérification.', "We couldn't get the verification status."],
  ['session_id manke.', 'session_id manquant.', 'session_id missing.'],
  ['Tip demand lan envalid.', 'Type de demande invalide.', 'Invalid request type.'],
  ['Ou dwe telechaje yon dokiman.', 'Vous devez téléverser un document.', 'You must upload a document.'],

  // ---------- Sipò / notifikasyon ----------
  ['Chwazi yon sijè.', 'Choisissez un sujet.', 'Choose a subject.'],
  ['Ekri mesaj ou anvan ou voye l.', "Écrivez votre message avant de l'envoyer.", 'Write your message before sending it.'],
  ['Nou pa t ka voye mesaj ou a. Eseye ankò.', "Impossible d'envoyer votre message. Réessayez.", "We couldn't send your message. Please try again."],
  ['Nou pa t ka jwenn mesaj yo.', 'Impossible de récupérer les messages.', "We couldn't load the messages."],
  ['Notifikasyon an pa jwenn.', 'Notification introuvable.', 'Notification not found.'],
  ['Notifikasyon sa a pa jwenn.', 'Notification introuvable.', 'Notification not found.'],

  // ================= NOTIFIKASYON =================
  ['Depo konfime', 'Dépôt confirmé', 'Deposit confirmed'],
  ['Depo refize', 'Dépôt refusé', 'Deposit rejected'],
  ['Depo {0} HTG ou a konfime — lajan an nan balans ou.', "Votre dépôt de {0} HTG est confirmé — l'argent est sur votre solde.", 'Your {0} HTG deposit is confirmed — the money is in your balance.'],
  ['Depo {0} HTG ou a refize. Kontakte sipò si w panse gen yon erè.', "Votre dépôt de {0} HTG a été refusé. Contactez le support si vous pensez qu'il y a une erreur.", 'Your {0} HTG deposit was rejected. Contact support if you think this is a mistake.'],
  ['Depo MonCash ou ({0} HTG) konfime — li ajoute nan balans ou.', 'Votre dépôt MonCash ({0} HTG) est confirmé — il a été ajouté à votre solde.', 'Your MonCash deposit ({0} HTG) is confirmed — it was added to your balance.'],
  ['Retrè konfime', 'Retrait confirmé', 'Withdrawal confirmed'],
  ['Retrè refize', 'Retrait refusé', 'Withdrawal rejected'],
  ['Retrè {0} HTG ou a konfime.', 'Votre retrait de {0} HTG est confirmé.', 'Your {0} HTG withdrawal is confirmed.'],
  ['Retrè {0} HTG ou a refize — lajan an remèt nan balans ou.', "Votre retrait de {0} HTG a été refusé — l'argent a été remis sur votre solde.", 'Your {0} HTG withdrawal was rejected — the money was returned to your balance.'],
  ['Prè apwouve', 'Prêt approuvé', 'Loan approved'],
  ['Demand prè refize', 'Demande de prêt refusée', 'Loan request rejected'],
  ['Prè {0} HTG ou a apwouve — lajan an nan balans ou.', "Votre prêt de {0} HTG est approuvé — l'argent est sur votre solde.", 'Your {0} HTG loan is approved — the money is in your balance.'],
  ['Demand prè {0} HTG ou a refize.', 'Votre demande de prêt de {0} HTG a été refusée.', 'Your {0} HTG loan request was rejected.'],
  ['Kont ou verifye', 'Compte vérifié', 'Account verified'],
  ['Idantite w konfime — kont ou verifye kounye a.', 'Votre identité est confirmée — votre compte est maintenant vérifié.', 'Your identity is confirmed — your account is now verified.'],
  ['Verifikasyon w resevwa', 'Vérification reçue', 'Verification received'],
  ['Nou resevwa rezilta verifikasyon idantite w — n ap egzamine l anvan konfimasyon final.', "Nous avons reçu le résultat de votre vérification d'identité — nous l'examinons avant la confirmation finale.", "We received your identity verification result — we'll review it before final confirmation."],
  ['Demand verifikasyon refize', 'Demande de vérification refusée', 'Verification request rejected'],
  ['Nou bezwen yon dokiman siplemantè', "Nous avons besoin d'un document supplémentaire", 'We need an additional document'],
  ['Tanpri voye: {0}.', 'Merci d’envoyer : {0}.', 'Please send: {0}.'],
  ['Dokiman ou apwouve', 'Document approuvé', 'Document approved'],
  ['Dokiman ou refize', 'Document refusé', 'Document rejected'],
  ['{0} ou a apwouve.', 'Votre {0} a été approuvé(e).', 'Your {0} was approved.'],
  ['Prèv adrès', 'preuve d’adresse', 'proof of address'],
  ['Prèv revni', 'preuve de revenus', 'proof of income'],
  ['Refè verifikasyon idantite', "nouvelle vérification d'identité", 'identity re-verification'],
  ['Lòt dokiman', 'autre document', 'other document'],
  ['Demand', 'demande', 'request'],
  ['Demand Sòl apwouve', 'Demande Sòl approuvée', 'Sòl request approved'],
  ['Demand Sòl refize', 'Demande Sòl refusée', 'Sòl request rejected'],
  ['Ou antre nan gwoup "{0}" — pozisyon #{1} nan wotasyon an.', 'Vous avez rejoint le groupe "{0}" — position #{1} dans la rotation.', 'You joined the group "{0}" — position #{1} in the rotation.'],
  ['Demand ou pou antre nan gwoup "{0}" refize. Nou remèt {1} HTG frè entegrasyon ou te peye a.', "Votre demande pour rejoindre le groupe \"{0}\" a été refusée. Nous vous avons remboursé les {1} HTG de frais d'intégration.", 'Your request to join the group "{0}" was rejected. We refunded the {1} HTG integration fee you paid.'],
  ['Demand ou pou antre nan gwoup "{0}" refize.', 'Votre demande pour rejoindre le groupe "{0}" a été refusée.', 'Your request to join the group "{0}" was rejected.'],
  ['Wotasyon Sòl kòmanse', 'La rotation Sòl a commencé', 'Sòl rotation started'],
  ['Gwoup "{0}" kòmanse — kotizasyon ou dwe peye anvan {1}.', 'Le groupe "{0}" a commencé — votre cotisation doit être payée avant le {1}.', 'Group "{0}" has started — your contribution is due before {1}.'],
  ['Gwoup "{0}" kòmanse.', 'Le groupe "{0}" a commencé.', 'Group "{0}" has started.'],
  ['Kotizasyon Sòl pa peye', 'Cotisation Sòl impayée', 'Sòl contribution unpaid'],
  ['Ou gen {0} jou pou regilarize kotizasyon Sòl ou.', 'Vous avez {0} jours pour régulariser votre cotisation Sòl.', 'You have {0} days to settle your Sòl contribution.'],
  ['Ou pa gen ase lajan pou kotizasyon Sòl ou. Ou gen {0} jou gras anvan penalite kòmanse.', "Vous n'avez pas assez d'argent pour votre cotisation Sòl. Vous avez {0} jours de grâce avant les pénalités.", "You don't have enough money for your Sòl contribution. You have {0} grace days before penalties start."],
  ['Kotizasyon Sòl an reta serye', 'Cotisation Sòl en retard grave', 'Sòl contribution seriously overdue'],
  ['Ou deja resevwa pòch ou pou Sòl sa a, men ou pa peye kotizasyon ou — yon admin BLICPay ap kontakte w.', "Vous avez déjà reçu votre pot pour ce Sòl, mais vous n'avez pas payé votre cotisation — un administrateur BLICPay va vous contacter.", "You already received your pot for this Sòl but haven't paid your contribution — a BLICPay admin will contact you."],
  ['Delè gras ak penalite a pase — yon admin BLICPay ap kontakte w pou desizyon final.', 'Le délai de grâce et de pénalité est dépassé — un administrateur BLICPay va vous contacter pour la décision finale.', 'The grace and penalty period has passed — a BLICPay admin will contact you for a final decision.'],
  ['Ou resevwa pòch Sòl ou', 'Vous avez reçu votre pot Sòl', 'You received your Sòl pot'],
  ['Ou resevwa {0} HTG pou "{1}".', 'Vous avez reçu {0} HTG pour "{1}".', 'You received {0} HTG for "{1}".'],
  ['Kont ou eskli nan Sòl', 'Compte exclu du Sòl', 'Account excluded from Sòl'],
  ['Akòz plizyè pwoblèm peman, ou pa ka patisipe nan okenn Sòl oswa Prè ankò. Lòt sèvis BLICPay yo rete disponib.', 'En raison de plusieurs problèmes de paiement, vous ne pouvez plus participer à aucun Sòl ni Prêt. Les autres services BLICPay restent disponibles.', 'Due to several payment issues, you can no longer join any Sòl or Loan. Other BLICPay services remain available.'],
  ['Nouvo dokiman disponib', 'Nouveau document disponible', 'New document available'],
  ['Nou ajoute yon nouvo dokiman ("{0}") nan dosye Sòl ou.', 'Nous avons ajouté un nouveau document ("{0}") à votre dossier Sòl.', 'We added a new document ("{0}") to your Sòl file.'],
  ['Dokiman Sòl konfime', 'Documents Sòl confirmés', 'Sòl documents confirmed'],
  ['Dokiman Sòl an atant', 'Documents Sòl en attente', 'Sòl documents pending'],
  ['Nou konfime nou resevwa dokiman ki nesesè pou Sòl sa a.', 'Nous confirmons avoir reçu les documents nécessaires pour ce Sòl.', 'We confirm we received the documents required for this Sòl.'],
  ['Estati dokiman Sòl ou chanje — kontakte sipò si ou gen kesyon.', 'Le statut de vos documents Sòl a changé — contactez le support si vous avez des questions.', 'Your Sòl document status changed — contact support if you have questions.'],

  // Notifikasyon pou admin yo
  ['Nouvo depo ap tann konfimasyon', 'Nouveau dépôt en attente de confirmation', 'New deposit awaiting confirmation'],
  ['{0} fè yon depo {1} HTG ({2}).', '{0} a fait un dépôt de {1} HTG ({2}).', '{0} made a {1} HTG deposit ({2}).'],
  ['Nouvo demand retrè', 'Nouvelle demande de retrait', 'New withdrawal request'],
  ['{0} mande retire {1} HTG.', '{0} demande à retirer {1} HTG.', '{0} requested to withdraw {1} HTG.'],
  ['Nouvo demand Sòl', 'Nouvelle demande Sòl', 'New Sòl request'],
  ['{0} mande antre nan "{1}".', '{0} demande à rejoindre "{1}".', '{0} requested to join "{1}".'],
  ['Nouvo mesaj sipò', 'Nouveau message au support', 'New support message'],
  ['Dokiman siplemantè soumèt', 'Document supplémentaire soumis', 'Additional document submitted'],
  ['{0} soumèt dokiman li mande a.', '{0} a soumis le document demandé.', '{0} submitted the requested document.'],
  ['Rezilta KYC pare pou egzamen', 'Résultat KYC prêt à examiner', 'KYC result ready for review'],
  ['Rapò Didit {0} rive — estati: {1}.', 'Rapport Didit de {0} reçu — statut : {1}.', 'Didit report for {0} received — status: {1}.'],
];

const DAYS = {
  ht: ['Dimanch', 'Lendi', 'Madi', 'Mèkredi', 'Jedi', 'Vandredi', 'Samdi'],
  fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};
const MONTHS = {
  ht: ['Janvye', 'Fevriye', 'Mas', 'Avril', 'Me', 'Jen', 'Jiyè', 'Out', 'Septanm', 'Oktòb', 'Novanm', 'Desanm'],
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
const HT_DATE = new RegExp(`^(${DAYS.ht.join('|')}) (\\d{1,2}) (${MONTHS.ht.join('|')})$`);

const exact = new Map(); // Kreyòl → { fr, en }
const patterns = []; // { re, fr, en }

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

for (const [ht, fr, en] of ENTRIES) {
  if (/\{\d\}/.test(ht)) {
    const order = [];
    const src = escapeRe(ht).replace(/\\\{(\d)\\\}/g, (_, n) => {
      order.push(Number(n));
      return '(.+?)';
    });
    patterns.push({ re: new RegExp(`^${src}$`, 's'), order, fr, en });
  } else {
    exact.set(ht, { fr, en });
  }
}

function translatePart(part, lang) {
  const hit = exact.get(part);
  if (hit) return hit[lang];
  const d = part.match(HT_DATE);
  if (d) {
    const day = DAYS[lang][DAYS.ht.indexOf(d[1])];
    const month = MONTHS[lang][MONTHS.ht.indexOf(d[3])];
    return lang === 'en' ? `${day}, ${month} ${d[2]}` : `${day} ${d[2]} ${month}`;
  }
  return part;
}

export function translate(text, lang) {
  if (!text || typeof text !== 'string' || (lang !== 'fr' && lang !== 'en')) return text;
  const hit = exact.get(text);
  if (hit) return hit[lang];
  for (const p of patterns) {
    const m = text.match(p.re);
    if (m) {
      const args = {};
      p.order.forEach((n, i) => {
        args[n] = translatePart(m[i + 1], lang);
      });
      return p[lang].replace(/\{(\d)\}/g, (_, n) => args[n] ?? '');
    }
  }
  return text; // pa jwenn → kite l an Kreyòl (egz. rezon yon admin tape)
}

export function langFromReq(req) {
  const raw = String(req.headers['x-blic-lang'] || '').toLowerCase().slice(0, 2);
  return raw === 'fr' || raw === 'en' ? raw : 'ht';
}

// Middleware: tradui `error` ak lis notifikasyon yo nan chak repons JSON.
export function translateResponses(req, res, next) {
  const lang = langFromReq(req);
  if (lang === 'ht') return next();
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === 'object') {
      if (typeof body.error === 'string') body = { ...body, error: translate(body.error, lang) };
      if (Array.isArray(body.notifications)) {
        body = {
          ...body,
          notifications: body.notifications.map((n) =>
            n && typeof n === 'object' ? { ...n, title: translate(n.title, lang), body: translate(n.body, lang) } : n,
          ),
        };
      }
    }
    return originalJson(body);
  };
  next();
}
