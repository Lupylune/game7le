/**
 * Balle de foin qui roule façon virevoltant : état vide du classement,
 * quand personne n'a encore couru aujourd'hui.
 */
export default function BalleDeFoin() {
  return (
    <div className="hay-scene" role="img" aria-label="Personne n'a encore couru aujourd'hui.">
      <svg className="hay-bale" viewBox="0 0 48 48" width="44" height="44" aria-hidden>
        <circle cx="24" cy="24" r="19" fill="#fcd040" stroke="#c98a2b" strokeWidth="2.5" />
        {/* spirale du roulage */}
        <path
          d="M24 11 a13 13 0 1 0 13 13 M24 17 a7 7 0 1 1 -7 7 M24 21.5 a2.5 2.5 0 1 0 2.5 2.5"
          fill="none"
          stroke="#c98a2b"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* brins qui dépassent */}
        <path
          d="M40 11 l4 -4 M44 27 l5 1 M11 40 l-4 4"
          stroke="#c98a2b"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <div className="hay-ground" aria-hidden />
    </div>
  );
}
