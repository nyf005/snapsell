"use client";

import { useEffect, useState, useRef } from "react";
import { marketing } from "~/lib/copy/marketing";
import { cn } from "~/lib/utils";
import {
    ArrowLeft,
    BatteryFull,
    CheckCircle2,
    MoreVertical,
    Phone,
    Search,
    Signal,
    Sparkles,
    Video,
    Wifi,
} from "lucide-react";

/**
 * La démonstration silencieuse du produit.
 *
 * Le téléphone joue DEUX ÉCRANS successifs, dans le même appareil :
 *
 *   1. LA BOÎTE DE RÉCEPTION — six conversations ouvertes, des messages qui
 *      tombent de partout, des compteurs de non-lus qui montent. C'est la
 *      charge réelle : elle ne vient pas d'un client bavard, elle vient de six
 *      fils simultanés dont aucun n'a de réponse.
 *
 *   2. UNE CONVERSATION — on entre dans celle d'Aïcha, et SnapSell la mène
 *      seul de bout en bout : prix, réservation, adresse, confirmation,
 *      preuve de paiement, commande enregistrée.
 *
 * Le passage de l'un à l'autre est une VRAIE rupture — la liste sort par la
 * gauche, la conversation entre par la droite, l'en-tête change de nature.
 * Une version précédente empilait le désordre et la reprise dans le même fil :
 * les deux temps se lisaient comme une seule conversation qui se calme, et le
 * moment où le produit prend la main passait inaperçu.
 *
 * Dans cet écran, le téléphone est celui de la BOUTIQUE. Les réponses de
 * SnapSell partent donc à droite, à la place des messages que la personne
 * aurait tapés — chacune porte sa pastille. C'est l'argument entier : ce
 * téléphone répond sans que personne ne le tienne.
 */

const { itemLabel, itemCode, itemPrice, address, customerName, inbox, typing } = marketing.demo;

/* ── Écran 1 : la boîte de réception ──────────────────────────────────────── */

/**
 * Les messages tombent de plus en plus vite : 700 ms entre les deux premiers,
 * 300 ms entre les deux derniers.
 *
 * À cadence fixe et rapide (320 ms partout, comme dans une version
 * précédente), la liste se remplissait en 3 s — trop vite pour lire un seul
 * nom, et le désordre passait pour un effet de chargement. L'accélération fait
 * l'inverse : on a le temps d'entrer dans les deux premières conversations,
 * puis le rythme échappe. C'est la sensation qu'il faut donner, pas le compte
 * exact des messages.
 */
const INBOX_START = 500;
const INBOX_GAP_FIRST = 700;
const INBOX_GAP_LAST = 300;

const INBOX_GAPS = Math.max(inbox.length - 1, 1);

/** L'intervalle avant le message `index + 1`, interpolé du plus lent au plus vif. */
const inboxGap = (index: number) =>
    INBOX_GAP_FIRST +
    (INBOX_GAP_LAST - INBOX_GAP_FIRST) * (INBOX_GAPS > 1 ? index / (INBOX_GAPS - 1) : 1);

const inboxTimes = inbox.reduce<number[]>((times, _, i) => {
    times.push(i === 0 ? INBOX_START : times[i - 1]! + inboxGap(i - 1));
    return times;
}, []);

const INBOX_END = inboxTimes[inboxTimes.length - 1] ?? INBOX_START;

/**
 * Deux secondes sur la liste pleine, sans rien qui bouge.
 *
 * C'est le temps qu'il faut pour que le regard fasse le tour des six
 * conversations et de leurs compteurs. Sans cette pause, le basculement
 * arrivait pendant qu'on lisait encore : on ne voyait ni le désordre, ni la
 * solution, juste un mouvement continu.
 */
const SWITCH_AT = INBOX_END + 2000;

/**
 * Le basculement se joue en deux temps.
 *
 * D'abord le voile s'installe SUR la liste encore en place — on lit « SnapSell
 * prend le relais » avec le désordre toujours visible dessous, ce qui relie
 * explicitement les deux écrans. Puis, à `CHAT_AT`, la liste sort et la
 * conversation entre.
 *
 * La version précédente faisait sortir la liste dès l'apparition du voile :
 * les deux mouvements se superposaient et la bascule passait pour un simple
 * fondu.
 */
const OVERLAY_HOLD = 1100;
const CHAT_AT = SWITCH_AT + OVERLAY_HOLD;

/**
 * Le moment où les compteurs tombent à zéro, pendant le voile.
 *
 * C'est le seul endroit de l'animation où l'on voit le produit AGIR sur le
 * désordre plutôt que se substituer à lui : les dix non-lus s'effacent sous
 * les yeux, la liste reste. Le voile est volontairement translucide à cet
 * instant précis pour qu'on assiste à l'effacement au lieu de le découvrir
 * après coup.
 */
const CLEARED_AT = SWITCH_AT + 450;

/** Le temps que les panneaux finissent de glisser avant la première bulle. */
const SLIDE_MS = 600;

/** Teintes d'avatar, stables par personne — la liste doit rester reconnaissable. */
const AVATAR_TINTS: Record<string, string> = {
    "Aïcha": "bg-violet-500/20 text-violet-300",
    "Mariam": "bg-amber-500/20 text-amber-300",
    "Fatou": "bg-sky-500/20 text-sky-300",
    "Kouassi": "bg-emerald-500/20 text-emerald-300",
    "Adjoua": "bg-rose-500/20 text-rose-300",
};

const tintFor = (name: string) => AVATAR_TINTS[name] ?? "bg-muted text-muted-foreground";

type Row = { name: string; text: string; time: string; unread: number };

/* ── Écran 2 : la conversation ────────────────────────────────────────────── */

type MessageKind = "text" | "typing" | "image" | "receipt";

type Message = {
    id: string;
    uid?: string;
    /** `snapsell` part à droite : c'est le téléphone de la boutique. */
    sender: "customer" | "snapsell";
    kind: MessageKind;
    text: string;
    at: number;
};

/**
 * La vente, au rythme de la lecture.
 *
 * 900 ms de « écrit… », 1 500 ms entre deux tours. Les valeurs précédentes
 * (600 / 1 100) enchaînaient plus vite qu'on ne lit : les bulles se
 * remplaçaient avant d'avoir été parcourues, et le fil donnait une impression
 * de vitesse sans qu'on retienne un seul échange.
 *
 * Les temps sont comptés depuis la fin du glissement, pas depuis le
 * changement d'écran : la première bulle attend que la conversation soit
 * réellement en place.
 */
const SALE: Message[] = [
    { id: "1", sender: "customer", kind: "text", text: "Bonjour, le sac bleu est encore dispo ?", at: SLIDE_MS },
    { id: "2", sender: "snapsell", kind: "typing", text: typing, at: SLIDE_MS + 900 },
    { id: "3", sender: "snapsell", kind: "text", text: `Oui, le ${itemLabel.toLowerCase()} bleu — ${itemPrice}. Livraison partout à Abidjan.`, at: SLIDE_MS + 1800 },
    { id: "4", sender: "customer", kind: "text", text: "Je prends", at: SLIDE_MS + 3300 },
    { id: "5", sender: "snapsell", kind: "typing", text: typing, at: SLIDE_MS + 4100 },
    { id: "6", sender: "snapsell", kind: "text", text: "Réservé à ton nom. Envoie ton adresse.", at: SLIDE_MS + 5000 },
    { id: "7", sender: "customer", kind: "text", text: address, at: SLIDE_MS + 6500 },
    { id: "8", sender: "snapsell", kind: "typing", text: typing, at: SLIDE_MS + 7300 },
    { id: "9", sender: "snapsell", kind: "text", text: `Récap : ${itemLabel} — ${itemPrice}. Réponds OUI pour confirmer.`, at: SLIDE_MS + 8200 },
    { id: "10", sender: "customer", kind: "text", text: "OUI", at: SLIDE_MS + 9700 },
    { id: "11", sender: "snapsell", kind: "typing", text: typing, at: SLIDE_MS + 10500 },
    { id: "12", sender: "snapsell", kind: "text", text: "Commande enregistrée. Envoie ta preuve de paiement ici.", at: SLIDE_MS + 11400 },
    { id: "13", sender: "customer", kind: "image", text: "Capture", at: SLIDE_MS + 12900 },
    { id: "14", sender: "snapsell", kind: "typing", text: typing, at: SLIDE_MS + 13700 },
    { id: "15", sender: "snapsell", kind: "receipt", text: "Paiement reçu", at: SLIDE_MS + 14600 },
];

const SALE_END = CHAT_AT + SLIDE_MS + 14600;

/** 4 s sur le reçu : c'est la dernière image, celle qui doit rester. */
const LOOP_MS = SALE_END + 4000;

type Phase = "inbox" | "switching" | "chat";

export function SimulatedChat() {
    const [phase, setPhase] = useState<Phase>("inbox");
    const [rows, setRows] = useState<Row[]>([]);
    const [cleared, setCleared] = useState(false);
    /**
     * L'en-tête bascule APRÈS les panneaux, pas avec eux.
     *
     * Les deux changeaient ensemble : pendant la demi-seconde du glissement, la
     * fiche d'Aïcha coiffait la liste des conversations encore à l'écran. Un
     * en-tête de conversation au-dessus d'une boîte de réception, c'est
     * exactement l'ambiguïté que la séparation en deux écrans devait lever.
     *
     * Décalé de la durée du glissement, l'en-tête garde « Messages · 0 » — en
     * vert — le temps que la liste sorte. La lecture devient : dix rouges, puis
     * zéro vert, puis la conversation.
     */
    const [chatHeader, setChatHeader] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const threadRef = useRef<HTMLDivElement>(null);
    const runCountRef = useRef(0);

    useEffect(() => {
        if (threadRef.current) {
            threadRef.current.scrollTo({
                top: threadRef.current.scrollHeight,
                behavior: "smooth",
            });
        }
    }, [messages]);

    useEffect(() => {
        const timers: NodeJS.Timeout[] = [];
        const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

        const runSequence = () => {
            const run = ++runCountRef.current;

            // Écran 1 — chaque message fait remonter sa conversation en tête et
            // incrémente son compteur. C'est ce mouvement, pas le contenu des
            // messages, qui donne la sensation de déborder.
            inbox.forEach((event, index) => {
                at(inboxTimes[index]!, () => {
                    if (index === 0) {
                        setPhase("inbox");
                        setCleared(false);
                        setChatHeader(false);
                        setMessages([]);
                    }
                    setRows((prev) => {
                        const base = index === 0 ? [] : prev;
                        const existing = base.find((r) => r.name === event.name);
                        const others = base.filter((r) => r.name !== event.name);
                        return [
                            {
                                name: event.name,
                                text: event.text,
                                time: event.time,
                                unread: (existing?.unread ?? 0) + 1,
                            },
                            ...others,
                        ];
                    });
                });
            });

            // La bascule.
            at(SWITCH_AT, () => setPhase("switching"));
            at(CLEARED_AT, () => setCleared(true));
            at(CHAT_AT, () => setPhase("chat"));
            at(CHAT_AT + SLIDE_MS, () => setChatHeader(true));

            // Écran 2 — la vente.
            SALE.forEach((msg) => {
                at(CHAT_AT + msg.at, () => {
                    setMessages((prev) => {
                        const withUid: Message = { ...msg, uid: `${run}-${msg.id}` };
                        // Une bulle définitive remplace le « écrit… » qui
                        // l'annonçait.
                        if (msg.sender === "snapsell" && msg.kind !== "typing") {
                            return [...prev.filter((m) => m.kind !== "typing"), withUid];
                        }
                        return [...prev, withUid];
                    });
                });
            });
        };

        runSequence();
        const loop = setInterval(runSequence, LOOP_MS);

        return () => {
            timers.forEach(clearTimeout);
            clearInterval(loop);
        };
    }, []);

    // Les compteurs tombent à zéro pendant le voile, avant que la liste ne
    // sorte : c'est l'effacement qui doit se voir, pas son résultat.
    const totalUnread = cleared ? 0 : rows.reduce((sum, r) => sum + r.unread, 0);
    const inChat = phase === "chat";
    // Le statut de l'en-tête suit la conversation, comme dans WhatsApp.
    const isTyping = messages.some((m) => m.kind === "typing");

    return (
        <div className="relative shrink-0">
            {/*
                Le halo derrière l'appareil — le signal le plus grossier, et
                celui qui porte le plus loin.

                Rouge tant que les messages s'empilent, violet dès que SnapSell
                répond. On le perçoit du coin de l'œil, avant d'avoir lu quoi
                que ce soit à l'écran : les deux moitiés de l'animation ne se
                distinguaient que par leur contenu, elles se distinguent
                maintenant par leur température.

                Une seconde de transition, plus lent que tout le reste : la
                couleur doit fondre, pas commuter — une bascule franche se
                lirait comme un changement d'image.
            */}
            <div
                aria-hidden="true"
                className={cn(
                    "pointer-events-none absolute -inset-6 z-0 rounded-[4rem] blur-3xl transition-colors duration-1000 ease-in-out",
                    inChat ? "bg-primary/25" : "bg-destructive/20"
                )}
            />

            {/*
                LE CHÂSSIS — aux proportions réelles d'un iPhone 16 Pro.

                L'appareil mesurait 380 × 660, soit un rapport de 0,576. Aucun
                téléphone récent n'a cette silhouette : c'est celle d'un iPhone
                8. Les modèles à Dynamic Island font 393 × 852 points, soit
                0,461 — nettement plus élancés. Un mockup au mauvais rapport se
                remarque sans qu'on sache dire pourquoi, comme un visage aux
                proportions légèrement fausses.

                Le rapport est désormais porté par `aspect-[393/852]` sur
                l'ÉCRAN, pas sur le châssis : c'est l'écran qui a les
                proportions du téléphone, la lunette s'ajoute autour. Poser le
                rapport sur le châssis aurait donné un écran à 0,44.

                Le contour est une marge intérieure et non une bordure, pour que
                la lunette garde la même épaisseur sur les quatre côtés, et les
                rayons suivent le rapport réel de l'appareil (55 pt de rayon
                pour 393 pt de large, soit 0,14 × la largeur).
            */}
            <div className="relative z-10 rounded-[45px] bg-[#1e1e24] p-[10px] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)] sm:rounded-[50px] sm:p-[11px] lg:rounded-[55px] lg:p-[12px]">
            {/*
                L'écran est dimensionné par sa HAUTEUR, la largeur suit le
                rapport. Fixer la largeur donnait 310 × 672, soit un châssis de
                696 px : ajouté aux marges du hero, l'appareil débordait de
                40 px sur un écran de 800 px de haut — la moitié basse de la
                démonstration passait sous la ligne de flottaison, exactement
                là où tombe le reçu.

                `min(680px, 100dvh - 11rem)` réserve les marges verticales du
                hero et plafonne la taille sur les grands écrans : l'appareil
                grandit avec la fenêtre jusqu'à 680 px, puis s'arrête.
            */}
            <div className="relative flex h-[500px] flex-col overflow-hidden rounded-[35px] bg-background font-sans aspect-[393/852] sm:h-[560px] sm:rounded-[39px] lg:h-[min(680px,calc(100dvh_-_11rem))] lg:rounded-[43px]">

            {/*
                Dynamic Island — 125 × 36 pt à 11 pt du haut sur un écran de
                393 pt, soit 32 % de la largeur. Elle était à 6 px du bord et
                calée sur le châssis au lieu de l'écran : elle mordait sur la
                lunette.
            */}
            <div className="absolute left-1/2 top-[7px] z-50 flex h-[24px] w-[80px] -translate-x-1/2 items-center justify-between rounded-full bg-[#1e1e24] px-2 sm:top-[8px] sm:h-[26px] sm:w-[90px] sm:px-2.5 lg:top-[9px] lg:h-[28px] lg:w-[99px]">
                <div className="size-1.5 rounded-full bg-white/10" />
                <div className="size-2.5 rounded-full bg-indigo-500/20 flex items-center justify-center">
                    <div className="size-1 rounded-full bg-indigo-500/80" />
                </div>
            </div>

            {/*
                L'en-tête change de nature ET de couleur entre les deux écrans :
                rouge tant que les non-lus s'accumulent, violet dès que SnapSell
                répond. Le fond neutre qu'il portait avant se lisait comme un
                simple en-tête d'application — il ne prenait pas parti, alors
                que c'est le premier endroit où le désordre devrait se voir.

                Il porte maintenant la barre d'état, comme dans une vraie
                application : l'heure et les indicateurs partagent sa couleur au
                lieu de flotter sur un `pt-10` vide. L'heure est celle du
                dernier message de la boîte de réception — le désordre et la
                pendule racontent la même minute.
            */}
            <div className={cn(
                "relative z-20 shrink-0 border-b shadow-sm backdrop-blur-md transition-colors duration-700",
                inChat ? "border-primary/20 bg-primary/10" : "border-destructive/20 bg-destructive/[0.07]"
            )}>
                {/*
                    Barre d'état : hauteur du refuge haut d'iOS (59 pt ≈ 46 px à
                    notre échelle), contenu centré sur l'axe de la Dynamic
                    Island pour que l'heure et l'îlot s'alignent.
                */}
                <div className="flex h-[38px] items-center justify-between px-4 text-[10px] font-semibold text-foreground/70 sm:h-[42px] sm:text-[10.5px] lg:h-[46px] lg:text-[11px]">
                    <span className="tabular-nums">{inbox[inbox.length - 1]?.time}</span>
                    <span className="flex items-center gap-1">
                        <Signal className="size-[11px]" aria-hidden="true" />
                        <Wifi className="size-[11px]" aria-hidden="true" />
                        <BatteryFull className="size-[15px]" aria-hidden="true" />
                    </span>
                </div>

                <div className="flex items-center justify-between px-3 pb-2.5">
                {chatHeader ? (
                    <>
                        {/*
                            `min-w-0` en cascade sur les trois conteneurs : sans
                            lui, un enfant flex refuse de descendre sous la
                            largeur de son contenu et pousse la colonne hors de
                            l'écran au lieu de la rétrécir. C'est ce qui se
                            passait sur mobile — le statut ne repliait plus
                            grâce à `whitespace-nowrap`, il débordait de 36 px.
                        */}
                        <div className="flex min-w-0 items-center gap-2.5">
                            <ArrowLeft className="size-4 shrink-0 text-primary" aria-hidden="true" />
                            <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold", tintFor(customerName))}>
                                {customerName.charAt(0)}
                            </div>
                            <div className="flex min-w-0 flex-col">
                                <h3 className="text-[15px] font-semibold leading-tight text-foreground">
                                    {customerName}
                                </h3>
                                {/*
                                    « SnapSell répond pour vous » passait sur
                                    deux lignes : la colonne du nom ne fait que
                                    ~130 px une fois retirés la flèche, l'avatar
                                    et les trois icônes de droite, et le libellé
                                    en réclamait 135.

                                    Le statut alterne désormais comme dans un
                                    vrai fil — « écrit… » pendant la frappe,
                                    « SnapSell répond » sinon. C'est plus court,
                                    c'est la convention que la personne connaît,
                                    et pendant les quatre secondes cumulées de
                                    frappe l'en-tête montre l'assistant en train
                                    de travailler plutôt qu'un état figé.

                                    `whitespace-nowrap` verrouille la ligne :
                                    même si un libellé s'allonge un jour, il
                                    débordera visiblement au lieu de replier
                                    l'en-tête en silence.
                                */}
                                <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] font-medium leading-tight text-primary">
                                    <Sparkles className="size-3 shrink-0" aria-hidden="true" />
                                    <span className="truncate">
                                        {isTyping ? typing : "SnapSell répond"}
                                    </span>
                                </p>
                            </div>
                        </div>
                        {/*
                            Les icônes d'appel disparaissent sous `sm`. Elles
                            coûtent 40 px sur un écran qui n'en fait que 231, et
                            c'est précisément la place qui manquait au statut.
                            Ce sont aussi les seuls éléments de l'en-tête qui ne
                            racontent rien : personne n'appelle sa cliente
                            depuis une démonstration.
                        */}
                        <div className="flex shrink-0 items-center gap-3 text-primary opacity-80">
                            <Video className="hidden size-5 sm:block" />
                            <Phone className="hidden size-4 sm:block" />
                            <MoreVertical className="size-5" />
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex items-center gap-2.5">
                            <h3 className="text-[17px] font-bold leading-tight text-foreground">
                                Messages
                            </h3>
                            {/*
                                Le compteur ne disparaît pas quand il tombe à
                                zéro : il AFFICHE zéro, en vert. Un badge qui
                                s'efface se lit comme un élément qu'on a retiré ;
                                un badge qui passe de 10 à 0 se lit comme un
                                travail qui a été fait.
                            */}
                            <span
                                key={totalUnread}
                                className={cn(
                                    "animate-in rounded-full px-2 py-0.5 text-[11px] font-bold leading-none zoom-in-50 duration-300",
                                    totalUnread === 0
                                        ? "bg-emerald-500 text-white"
                                        : "bg-destructive text-destructive-foreground"
                                )}
                            >
                                {totalUnread}
                            </span>
                        </div>
                        <div className="flex items-center gap-3 text-muted-foreground opacity-80">
                            <Search className="size-4" />
                            <MoreVertical className="size-5" />
                        </div>
                    </>
                )}
                </div>
            </div>

            {/*
                LE BANDEAU AVANT / APRÈS.

                Il reprend mot pour mot les deux repères du texte à gauche —
                « Aujourd'hui » y devient « Sans SnapSell », « Avec SnapSell »
                reste tel quel. Le lecteur qui vient de parcourir la colonne
                retrouve la même opposition dans l'appareil, avec les mêmes
                mots : la démonstration cesse d'être une illustration posée à
                côté du texte, elle en devient la deuxième moitié.

                C'est aussi le seul élément qui NOMME ce qu'on regarde. Sans
                lui, le premier écran est juste une boîte de réception pleine —
                rien ne dit qu'elle représente l'absence du produit.
            */}
            <div
                className={cn(
                    "relative z-20 flex shrink-0 items-center justify-center gap-1.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] transition-colors duration-700",
                    inChat
                        ? "bg-primary/15 text-primary"
                        : "bg-destructive/15 text-destructive"
                )}
            >
                {inChat && <Sparkles className="size-3" aria-hidden="true" />}
                {inChat ? "Avec SnapSell" : "Sans SnapSell"}
            </div>

            {/* Corps — les deux panneaux coulissent dans la même fenêtre. */}
            <div className="relative flex-1 overflow-hidden bg-background">
                <div
                    className="pointer-events-none absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: "url('https://i.pinimg.com/736x/8e/46/40/8e46405bc7378fc7bb2fbe21ff7eeb39.jpg')",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                    }}
                />

                {/* ── Écran 1 : la liste ── */}
                <div
                    className={cn(
                        // La liste reste en place pendant `switching` : le voile
                        // s'affiche PAR-DESSUS le désordre, et ce n'est qu'au
                        // passage en `chat` qu'elle sort. Les deux mouvements
                        // se suivent au lieu de se superposer.
                        "absolute inset-0 flex flex-col divide-y divide-border/40 overflow-hidden transition-all duration-500 ease-in-out",
                        phase === "chat"
                            ? "pointer-events-none -translate-x-1/3 opacity-0"
                            : "translate-x-0 opacity-100"
                    )}
                >
                    {rows.map((row, index) => (
                        /*
                            La clef inclut le compteur : à chaque nouveau
                            message, React remonte la ligne, ce qui rejoue son
                            animation d'entrée. La conversation ne se contente
                            pas de remonter en tête, elle « saute » — c'est le
                            mouvement qu'on voit du coin de l'œil dans un vrai
                            téléphone.
                        */
                        <div
                            key={`${row.name}-${row.unread}-${cleared ? "ok" : "wait"}`}
                            className={cn(
                                "flex animate-in items-center gap-3 px-3 py-2.5 fade-in slide-in-from-top-2 duration-300",
                                index === 0 && !cleared && "bg-destructive/[0.06]"
                            )}
                            style={{ animationFillMode: "forwards" }}
                        >
                            <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-[14px] font-bold", tintFor(row.name))}>
                                {row.name.charAt(0)}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="truncate text-[14px] font-semibold text-foreground">
                                        {row.name}
                                    </span>
                                    {/*
                                        L'heure est rouge tant que le message
                                        attend, grise dès qu'il a sa réponse.
                                        C'est la convention de WhatsApp
                                        lui-même : un horaire coloré signale
                                        qu'il reste quelque chose à faire.
                                    */}
                                    <span className={cn(
                                        "shrink-0 text-[11px] font-medium transition-colors duration-500",
                                        cleared ? "text-muted-foreground" : "text-destructive"
                                    )}>
                                        {row.time}
                                    </span>
                                </div>
                                <div className="mt-0.5 flex items-center justify-between gap-2">
                                    <span className="truncate text-[12.5px] text-muted-foreground">
                                        {row.text}
                                    </span>
                                    {/*
                                        Le compteur rouge devient une coche
                                        verte. Les dix pastilles basculent
                                        ensemble, sous le voile translucide :
                                        c'est le seul instant où l'on voit le
                                        produit agir sur le désordre au lieu de
                                        le remplacer.
                                    */}
                                    {cleared ? (
                                        <CheckCircle2 className="size-[18px] shrink-0 animate-in text-emerald-500 zoom-in-50 duration-500" aria-hidden="true" />
                                    ) : (
                                        <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-destructive text-[10px] font-bold leading-none text-destructive-foreground">
                                            {row.unread}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Écran 2 : la conversation ── */}
                <div
                    className={cn(
                        "absolute inset-0 flex flex-col overflow-hidden transition-all duration-500 ease-out",
                        inChat ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-1/4 opacity-0"
                    )}
                >
                    <div
                        ref={threadRef}
                        className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    >
                        {/*
                            `mt-auto` : tant que la conversation est plus courte
                            que le cadre, elle reste collée au bas et monte au
                            fur et à mesure, comme dans un vrai WhatsApp.
                        */}
                        <div className="mt-auto flex flex-col gap-3">
                            {messages.map((msg) => {
                                if (msg.kind === "receipt") {
                                    /*
                                        Le reçu n'est pas une bulle : c'est le
                                        moment où la conversation devient une
                                        commande, le seul endroit où l'on voit
                                        le produit faire son travail plutôt que
                                        parler. Lui donner la forme d'un message
                                        le noierait dans le fil.
                                    */
                                    return (
                                        <div
                                            key={msg.uid ?? msg.id}
                                            className="w-[86%] animate-in self-end rounded-[1.1rem] rounded-tr-sm border border-emerald-500/30 bg-emerald-500/10 p-3 shadow-sm fade-in slide-in-from-bottom-3 duration-500"
                                            style={{ animationFillMode: "forwards" }}
                                        >
                                            <div className="flex items-center gap-2">
                                                <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-hidden="true" />
                                                <span className="text-[14px] font-bold text-foreground">{msg.text}</span>
                                            </div>
                                            <div className="mt-2 space-y-1 border-t border-emerald-500/20 pt-2 text-[12px] text-muted-foreground">
                                                <div className="flex justify-between gap-2">
                                                    <span>Article</span>
                                                    <span className="font-semibold text-foreground">{itemLabel} · {itemCode}</span>
                                                </div>
                                                <div className="flex justify-between gap-2">
                                                    <span>Montant</span>
                                                    <span className="font-semibold text-foreground">{itemPrice}</span>
                                                </div>
                                                <div className="flex justify-between gap-2">
                                                    <span>Commande</span>
                                                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">enregistrée</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }

                                const fromSnapSell = msg.sender === "snapsell";

                                return (
                                    <div
                                        key={msg.uid ?? msg.id}
                                        className={cn(
                                            "relative z-10 max-w-[85%] animate-in rounded-[1.1rem] px-3.5 py-2 text-[14px] leading-[1.4] shadow-sm fade-in slide-in-from-bottom-3",
                                            fromSnapSell
                                                ? "self-end rounded-tr-sm bg-primary text-primary-foreground"
                                                : "self-start rounded-tl-sm border border-border/50 bg-muted text-foreground"
                                        )}
                                        style={{ animationFillMode: "forwards" }}
                                    >
                                        {msg.kind === "typing" ? (
                                            <span className="flex min-h-[20px] items-center gap-1">
                                                <span className="size-[5px] animate-bounce rounded-full bg-primary-foreground/60" />
                                                <span className="size-[5px] animate-bounce rounded-full bg-primary-foreground/60 [animation-delay:0.2s]" />
                                                <span className="size-[5px] animate-bounce rounded-full bg-primary-foreground/60 [animation-delay:0.4s]" />
                                            </span>
                                        ) : msg.kind === "image" ? (
                                            <div className="-mx-0.5 flex flex-col items-start gap-1.5">
                                                <div className="relative h-[112px] w-[148px] overflow-hidden rounded-xl border border-border/40 bg-white">
                                                    <div className="flex items-center gap-1.5 bg-[#1a1a2e] px-2.5 py-1.5">
                                                        <div className="size-3 rounded-full bg-blue-400/70" />
                                                        <div className="h-1.5 w-12 rounded-full bg-white/30" />
                                                    </div>
                                                    <div className="flex flex-col gap-1.5 bg-white px-2.5 py-2">
                                                        <div className="h-1.5 w-16 rounded-full bg-gray-300" />
                                                        <div className="mt-0.5 h-4 w-20 rounded bg-gray-800/15" />
                                                        <div className="h-1.5 w-24 rounded-full bg-gray-200" />
                                                        <div className="mt-0.5 flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-1">
                                                            <CheckCircle2 className="size-2.5 shrink-0 text-emerald-500" />
                                                            <div className="h-1.5 w-14 rounded-full bg-emerald-400/60" />
                                                        </div>
                                                    </div>
                                                </div>
                                                <span className="pl-0.5 text-[10px] text-muted-foreground">Capture · 148 Ko</span>
                                            </div>
                                        ) : (
                                            <>
                                                {msg.text}
                                                {/*
                                                    La pastille sur chaque bulle
                                                    sortante. Sans elle, ce fil
                                                    est celui d'une personne qui
                                                    répond vite ; avec elle, on
                                                    voit que le téléphone répond
                                                    seul. C'est toute la
                                                    démonstration.
                                                */}
                                                {fromSnapSell && (
                                                    <span className="mt-1 flex items-center justify-end gap-1 text-[10px] font-semibold text-primary-foreground/60">
                                                        <Sparkles className="size-2.5" aria-hidden="true" />
                                                        SnapSell
                                                    </span>
                                                )}
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/*
                    Le voile de bascule.

                    Il était opaque à 75 % avec un flou franc : il cachait
                    précisément ce qu'on veut montrer. Les dix pastilles rouges
                    qui deviennent vertes se produisent DERRIÈRE lui, et c'est
                    le seul moment où le produit agit sur le désordre au lieu de
                    s'y substituer.

                    Il est donc descendu à 40 % avec un flou d'un pixel et demi :
                    assez pour détacher le libellé, trop peu pour masquer la
                    liste. On lit « SnapSell prend le relais » ET on voit les
                    compteurs tomber, dans le même instant.
                */}
                <div
                    className={cn(
                        // Entrée franche (250 ms), sortie lente (700 ms) : le
                        // voile accompagne encore le début du glissement.
                        "pointer-events-none absolute inset-0 z-30 grid place-items-center bg-background/40 backdrop-blur-[1.5px]",
                        phase === "switching"
                            ? "opacity-100 transition-opacity duration-[250ms]"
                            : "opacity-0 transition-opacity duration-700"
                    )}
                >
                    <span className="inline-flex animate-in items-center gap-1.5 rounded-full border border-primary/40 bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground shadow-xl zoom-in-95 duration-300">
                        <Sparkles className="size-3.5" aria-hidden="true" />
                        SnapSell prend le relais
                    </span>
                </div>
            </div>

            {/*
                La barre du bas suit l'écran. En conversation, elle ne propose
                pas d'écrire : elle indique que la réponse est automatique. Un
                champ « Message » vide inviterait à taper, c'est-à-dire
                exactement ce que le produit supprime.
            */}
            {/*
                Le refuge bas d'iOS fait 34 pt, soit 27 px à notre échelle. La
                barre s'arrêtait à 8 px du bord : le libellé passait sous
                l'indicateur d'accueil, qui le barrait. Elle réserve désormais
                cette hauteur.
            */}
            <div className="relative z-10 flex shrink-0 items-center gap-2 border-t border-border/50 bg-background px-2 pb-[20px] pt-2 sm:pb-[24px] lg:pb-[27px]">
                {inChat ? (
                    /*
                        « Réponses envoyées automatiquement » tenait sur deux
                        lignes dans la barre, dont la largeur utile tombe à
                        ~230 px une fois l'icône et les marges retirées.

                        « Réponses automatiques » dit la même chose en deux mots
                        et se lit comme un ÉTAT du système — ce qu'une barre de
                        saisie remplacée doit annoncer. Le participe « envoyées »
                        décrivait une action, donc quelqu'un qui l'exécute :
                        exactement l'idée dont on veut débarrasser la personne.
                    */
                    <div className="flex min-h-[34px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-[12px] font-semibold leading-none text-primary sm:text-[13px]">
                        <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
                        Réponses automatiques
                    </div>
                ) : (
                    <div className="flex min-h-[34px] flex-1 items-center gap-2 rounded-full border border-border/50 bg-muted px-4 py-1.5">
                        <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="text-[13px] text-muted-foreground sm:text-[14px]">Rechercher</span>
                    </div>
                )}
            </div>

            {/*
                Indicateur d'accueil — 139 × 5 pt à 8 pt du bas, soit une
                largeur fixe et non un tiers de l'écran : il gardait la même
                proportion à toutes les tailles alors que la barre réelle a une
                largeur absolue.
            */}
            <div className="absolute bottom-[6px] left-1/2 z-50 h-[4px] w-[90px] -translate-x-1/2 rounded-full bg-foreground/25 sm:w-[100px] lg:w-[110px]" />
            </div>
            </div>
        </div>
    );
}
