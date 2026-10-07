import { Link } from "react-router-dom";
import { ArrowRight, Share2 } from "lucide-react";

/** The way to the member's taste card, where their statistics and profile are. */
export default function TasteCardLink() {
  return (
    <Link to="/taste" className="taste-card-link" data-track="taste_card_open">
      <Share2 className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <strong className="block">My cinema: your taste card</strong>
        <small className="block">Share it, and see how close a friend's taste is to yours.</small>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
    </Link>
  );
}
