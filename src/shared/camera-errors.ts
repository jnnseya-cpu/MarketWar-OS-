// WHY THE CAMERA DID NOT OPEN — the actual reason, not a guess.
//
// The recorder used to catch getUserMedia's error, throw it away, and print one
// sentence: "Your browser is blocking the camera for this site." That sentence
// is right for exactly one of the five things that go wrong here, and the owner
// followed its instructions, found the browser already set to Allow, and came
// back with "still not working" — because the advice could not fix a cause it
// had not looked at.
//
// getUserMedia rejects with a DOMException whose `name` says what happened. On a
// Windows laptop the two most common are not the browser at all:
//
//   NotAllowedError   the site is blocked in the browser, OR the whole OS is —
//                     Windows Privacy & security ▸ Camera, which no amount of
//                     clicking the padlock will change.
//   NotReadableError  the device is fine and something else already has it:
//                     Teams, Zoom, the Camera app, or a laptop privacy shutter.
//                     The old message sent these people to a setting that was
//                     already correct.
//   NotFoundError     no camera is attached at all.
//   OverconstrainedError  no mode matching what was asked for.
//   AbortError        the OS or driver took it away mid-open.
//
// This maps the name to what to actually DO. The name itself is shown alongside,
// because a person reporting "still not working" can then say which one it was.

export type CameraFailure = {
  /** The DOMException name, surfaced so a report is diagnosable. */
  name: string;
  /** What happened, in one line. */
  headline: string;
  /** The things to try, most likely first. */
  steps: string[];
};

const UNKNOWN = "Error";

export function cameraFailure(errName: string | undefined | null): CameraFailure {
  const name = (errName || "").trim() || UNKNOWN;

  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return {
        name,
        headline: "Permission to use the camera was refused — nothing was recorded, so your take is safe.",
        steps: [
          "Click the camera or padlock icon at the left of the address bar and set Camera to Allow, then reload this page.",
          "On Windows, check Settings ▸ Privacy & security ▸ Camera: both “Camera access” and “Let desktop apps access your camera” must be on. A browser set to Allow still gets refused when this is off.",
          "On a Mac, check System Settings ▸ Privacy & Security ▸ Camera and tick your browser.",
        ],
      };

    case "NotReadableError":
    case "TrackStartError":
      return {
        name,
        headline: "The camera is there, but something else is already using it — nothing was recorded.",
        steps: [
          "Close any app that might hold the camera: Teams, Zoom, Meet, Slack huddles, OBS, or the Camera app. One of them keeps it even when minimised.",
          "Check the laptop's privacy shutter or camera key — many HP, Lenovo and Dell models have a physical slider or an F-key that cuts the camera off.",
          "Then press Start recording again. No reload is needed.",
        ],
      };

    case "NotFoundError":
    case "DevicesNotFoundError":
      return {
        name,
        headline: "No camera was found on this machine.",
        steps: [
          "If it is a plug-in webcam, check the cable and try another USB port.",
          "If it is built in, it may be disabled in Device Manager or switched off by a privacy key.",
          "You can record the screen on its own in the meantime — the button below does that.",
        ],
      };

    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return {
        name,
        headline: "The camera could not provide a usable picture size.",
        steps: [
          "This is usually a driver that only offers one exotic mode. Updating the camera driver normally fixes it.",
          "Record the screen on its own in the meantime — the button below does that.",
        ],
      };

    case "AbortError":
      return {
        name,
        headline: "The camera was taken away while it was opening.",
        steps: [
          "Something else grabbed it, or the driver restarted. Press Start recording again.",
          "If it keeps happening, close other video apps and reload the page.",
        ],
      };

    default:
      return {
        name,
        headline: "The camera could not be opened, and the browser did not say why.",
        steps: [
          "Press Start recording again — a first attempt sometimes fails while the device wakes up.",
          "Close any other app that uses the camera, then reload the page.",
          "You can record the screen on its own in the meantime — the button below does that.",
        ],
      };
  }
}

/** One flat string, for a caller that has nowhere to put a list. */
export function cameraFailureText(errName: string | undefined | null): string {
  const f = cameraFailure(errName);
  return `${f.headline} ${f.steps.join(" ")}`;
}
