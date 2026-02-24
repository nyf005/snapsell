"use client";

import { useEffect, useState, useRef } from "react";
import { cn } from "~/lib/utils";
import { MessageCircle, MoreVertical, Phone, Video, Send, CheckCircle2 } from "lucide-react";

type Message = {
    id: string;
    uid: string;
    sender: "user" | "bot";
    text: string;
    delayMs: number;
    isImage?: boolean;
};

const CHAT_SEQUENCE: Message[] = [
    { id: "1", sender: "user", text: "V12", delayMs: 1000 },
    { id: "2", sender: "bot", text: "Typing...", delayMs: 2500 },
    { id: "3", sender: "bot", text: "Réservé. Envoie ton adresse.", delayMs: 4000 },
    { id: "4", sender: "user", text: "42 rue de la Paix, Paris", delayMs: 7000 },
    { id: "5", sender: "bot", text: "Typing...", delayMs: 8500 },
    { id: "6", sender: "bot", text: "Récap : V12 — 15 000 FCFA — Total : 15 000 FCFA. Réponds OUI pour confirmer.", delayMs: 10000 },
    { id: "7", sender: "user", text: "OUI", delayMs: 12500 },
    { id: "8", sender: "bot", text: "Typing...", delayMs: 14000 },
    { id: "9", sender: "bot", text: "Commande enregistrée. Merci d'envoyer ta preuve de transfert ici.", delayMs: 15500 },
    { id: "10", sender: "user", text: "Photo", isImage: true, delayMs: 18500 },
    { id: "11", sender: "bot", text: "Typing...", delayMs: 20000 },
    { id: "12", sender: "bot", text: "Preuve bien reçue ! Nous la validons rapidement.", delayMs: 21500 },
];

export function SimulatedChat() {
    const [messages, setMessages] = useState<Message[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);
    const runCountRef = useRef(0);

    const scrollToBottom = () => {
        if (containerRef.current) {
            containerRef.current.scrollTo({
                top: containerRef.current.scrollHeight,
                behavior: "smooth"
            });
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        let timeoutIds: NodeJS.Timeout[] = [];

        const runSequence = () => {
            const run = ++runCountRef.current;
            setMessages([]);
            CHAT_SEQUENCE.forEach((val) => {
                const t = setTimeout(() => {
                    const msg: Message = { ...val, uid: `${run}-${val.id}` };
                    setMessages((prev) => {
                        if (msg.sender === 'bot' && msg.text !== 'Typing...') {
                            return [...prev.filter(m => m.text !== 'Typing...'), msg];
                        }
                        return [...prev, msg];
                    });
                }, val.delayMs);
                timeoutIds.push(t);
            });
        };

        runSequence();

        // Loop adjusted for the longer sequence
        const loop = setInterval(runSequence, 28000);

        return () => {
            timeoutIds.forEach(clearTimeout);
            clearInterval(loop);
        };
    }, []);

    return (
        <div className="relative w-[300px] lg:w-[340px] h-[626px] lg:h-[709px] shrink-0 overflow-hidden rounded-[2rem] md:rounded-[2.5rem] border-[10px] md:border-[12px] border-[#1e1e24] bg-background shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)] flex flex-col font-sans">
            {/* Dynamic Island / Notch Mockup */}
            <div className="absolute left-1/2 top-1.5 h-[26px] w-[95px] -translate-x-1/2 rounded-full bg-[#1e1e24] z-50 flex items-center justify-between px-2.5">
                <div className="size-1.5 rounded-full bg-white/10" />
                <div className="size-2.5 rounded-full bg-indigo-500/20 flex items-center justify-center">
                    <div className="size-1 rounded-full bg-indigo-500/80" />
                </div>
            </div>

            {/* Header WhatsApp mockup - Themed Purple */}
            <div className="flex items-center justify-between bg-primary/10 px-3 pb-2 pt-10 shadow-sm z-10 shrink-0 border-b border-primary/20 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-full bg-primary/20">
                        <MessageCircle className="size-5 text-primary" />
                    </div>
                    <div className="flex flex-col">
                        <h3 className="text-[15px] font-semibold text-foreground leading-tight">SnapSell Bot</h3>
                        <p className="text-[11px] text-primary leading-tight mt-0.5 font-medium">En ligne</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 text-primary opacity-80">
                    <Video className="size-5" />
                    <Phone className="size-4" />
                    <MoreVertical className="size-5" />
                </div>
            </div>

            {/* Messages body */}
            <div
                ref={containerRef}
                className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden relative bg-background"
            >
                {/* Background Pattern */}
                <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "url('https://i.pinimg.com/736x/8e/46/40/8e46405bc7378fc7bb2fbe21ff7eeb39.jpg')", backgroundSize: 'cover', backgroundPosition: 'center' }} />

                {messages.map((msg) => (
                    <div
                        key={msg.uid}
                        className={cn(
                            "max-w-[85%] rounded-[1.1rem] px-3.5 py-2 text-[14px] leading-[1.4] shadow-sm transition-all duration-300 relative z-10",
                            "animate-in fade-in slide-in-from-bottom-3",
                            msg.sender === "user"
                                ? "self-end rounded-tr-sm bg-primary text-primary-foreground"
                                : "self-start rounded-tl-sm bg-muted text-foreground border border-border/50"
                        )}
                        style={{ animationFillMode: "forwards" }}
                    >
                        {msg.text === "Typing..." ? (
                            <span className="flex items-center gap-1 min-h-[20px]">
                                <span className="size-[5px] animate-bounce rounded-full bg-primary/50" />
                                <span className="size-[5px] animate-bounce rounded-full bg-primary/50 [animation-delay:0.2s]" />
                                <span className="size-[5px] animate-bounce rounded-full bg-primary/50 [animation-delay:0.4s]" />
                            </span>
                        ) : msg.isImage ? (
                            <div className="flex flex-col gap-1.5 items-start -mx-0.5">
                                {/* Miniature screenshot virement bancaire */}
                                <div className="w-[148px] h-[112px] rounded-xl overflow-hidden border border-primary-foreground/20 bg-white relative">
                                    {/* En-tête app banque */}
                                    <div className="bg-[#1a1a2e] px-2.5 py-1.5 flex items-center gap-1.5">
                                        <div className="size-3 rounded-full bg-blue-400/70" />
                                        <div className="h-1.5 w-12 rounded-full bg-white/30" />
                                    </div>
                                    {/* Corps du virement */}
                                    <div className="px-2.5 py-2 flex flex-col gap-1.5 bg-white">
                                        <div className="h-1.5 w-16 rounded-full bg-gray-300" />
                                        <div className="h-4 w-20 rounded bg-gray-800/15 mt-0.5" />
                                        <div className="h-1.5 w-24 rounded-full bg-gray-200" />
                                        <div className="flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-1.5 py-1 mt-0.5">
                                            <CheckCircle2 className="size-2.5 text-emerald-500 shrink-0" />
                                            <div className="h-1.5 w-14 rounded-full bg-emerald-400/60" />
                                        </div>
                                    </div>
                                </div>
                                <span className="text-[10px] text-primary-foreground/60 pl-0.5">Capture · 148 Ko</span>
                            </div>
                        ) : (
                            msg.text
                        )}
                    </div>
                ))}
            </div>

            {/* Input WhatsApp Mockup - Themed Purple */}
            <div className="flex items-center gap-2 bg-background p-2 shrink-0 relative z-10 border-t border-border/50">
                <div className="flex-1 bg-muted rounded-full px-4 py-2 flex items-center min-h-[36px] border border-border/50">
                    <span className="text-muted-foreground text-[15px]">Message</span>
                </div>
                <div className="size-9 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/30">
                    <Send className="size-4 text-primary-foreground ml-0.5" />
                </div>
            </div>

            {/* iOS Bottom Bar */}
            <div className="absolute bottom-2 left-1/2 w-1/3 h-1 -translate-x-1/2 bg-foreground/20 rounded-full z-50" />
        </div>
    );
}
