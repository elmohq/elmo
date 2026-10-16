import { jevAnalyzer } from "../analyze";
import { stubTransport } from "../jev";

/** The analyzer with the stub in place of Jev: judges each company from cue words in its passages. */
export const cuedAnalyzer = jevAnalyzer(stubTransport);
