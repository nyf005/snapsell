export function HeroBackground() {
    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
            {/* Base */}
            <div className="absolute inset-0 bg-[var(--hero-bg)]" />

            {/* Aurora en dessous — richesse colorimétrique */}
            <div className="absolute -top-[20%] -left-[15%] h-[60vw] w-[60vw] max-w-[700px] max-h-[700px] rounded-full bg-[var(--hero-aurora-1)] blur-[100px]" />
            <div className="absolute top-[10%] -right-[10%] h-[50vw] w-[50vw] max-w-[600px] max-h-[600px] rounded-full bg-[var(--hero-aurora-2)] blur-[120px]" />
            <div className="absolute bottom-[-10%] left-[20%] h-[40vw] w-[40vw] max-w-[500px] max-h-[500px] rounded-full bg-[var(--hero-aurora-3)] blur-[100px]" />

            {/* Grille de dots — masquée aux bords */}
            <div className="hero-dot-grid absolute inset-0" />

            {/* Ambient color base — statique, grand, très doux */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="hero-ambient-glow" />
            </div>

            {/* Spotlight concentré — traverse vraiment le hero */}
            <div className="absolute top-[45%] left-[30%]">
                <div className="hero-spot-glow" />
            </div>

            {/* Grain texture */}
            <svg className="absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
                <filter id="hero-noise">
                    <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
                    <feColorMatrix type="saturate" values="0" />
                </filter>
                <rect
                    width="100%"
                    height="100%"
                    filter="url(#hero-noise)"
                    style={{ opacity: "var(--hero-grain)" }}
                />
            </svg>

            {/* Vignette edges */}
            <div className="hero-vignette absolute inset-0" />

            {/* Fondu bas */}
            <div className="hero-fade-bottom absolute bottom-0 inset-x-0 h-40" />
        </div>
    );
}
