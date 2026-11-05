import { Footer, Header, Skip } from '../Layout'
import { release } from '../release-data'
import { SAFETY } from '../content'

const UPDATED = '2026-11-05'

export default function Legal() {
  const who = release.operator || 'the operator of this site'
  const mail = release.contactEmail
  return (
    <div className="app page-legal">
      <Skip to="#main" />
      <Header current="legal" />
      <main id="main" className="page prose">
        <p className="kicker">Privacy and terms</p>
        <h1 className="ptitle">What this site does with your data, and what it is for.</h1>
        <p className="lead">Short version: the camera and the pose model run on your device, and no video, image or exercise record is sent to anyone. To let you sign in we keep your email address. Version {release.version}, updated {UPDATED}.</p>

        <h2 id="privacy">Privacy notice</h2>
        <h3>Who runs this</h3>
        <p>{who}.{mail ? <> Questions, complaints or requests: <a href={`mailto:${mail}`}>{mail}</a>.</> : ' A contact address is published here before launch.'}</p>

        <h3>What happens to the camera</h3>
        <p>The camera opens only after you agree on the Coach page, and only to count repetitions. The pose model is downloaded with the site and runs in your browser. Video frames are never recorded, saved or uploaded. Closing the session or the tab stops the camera.</p>

        <h3>Signing in</h3>
        <p>You sign in with a one-time code we email you, or with your Google account. On our server we keep your email address, your name if Google gives it to us, and the time you last signed in. A sign-in code is kept for 10 minutes. We do not keep your exercises, and we receive nothing from your camera.</p>
        <p>One cookie, <code>cc_session</code>, keeps you signed in for 30 days or until you sign out. It is needed for signing in and is the only cookie we set.</p>

        <h3>What is saved on your device</h3>
        <ul>
          <li>In your browser storage on this device, never on our server: the angle reached on each repetition, set and repetition counts, flags, the date and time, the mode, an age band such as &ldquo;60 to 74&rdquo; (never the exact age), whether you stopped for pain, and your choice about sharing.</li>
          <li>Your ABHA address, only if you typed it and agreed to share the record under it.</li>
          <li>On the Validation page, used by a physiotherapist: pairs of app and goniometer readings.</li>
        </ul>
        <p>Nothing in this list leaves your device unless you download a file and hand it to someone yourself.</p>

        <h3>What is not collected</h3>
        <p>No analytics, no advertising, no tracking cookies, and no requests from our pages to other companies&rsquo; servers. Choosing &ldquo;Continue with Google&rdquo; takes you to Google&rsquo;s own sign-in page, where Google&rsquo;s privacy policy applies. Sign-in codes are sent by email through our mail provider. Like any website, our hosting provider&rsquo;s servers see the technical details of a page request, such as the IP address, in their ordinary logs.</p>

        <h3>Children</h3>
        <p>The app is not for children under 12. For ages 12 to 17 a parent or guardian must be present and agree before a session starts, and the account should use a parent&rsquo;s or guardian&rsquo;s email address.</p>

        <h3>Your choices</h3>
        <p>On the <a href="/progress/">Progress</a> page you can delete one session or all of them, download your sessions, or delete your account. Deleting the account removes your email address, name and every sign-in from our server at once. Sessions are stored only on your device, so deleting them there removes them completely, because there is no copy anywhere else.</p>

        <h2 id="terms">Terms of use</h2>
        <ul>
          <li><strong>An exercise aid, not a medical device.</strong> It counts repetitions and measures movement from a camera image. It does not diagnose, treat or monitor a medical condition and does not replace a doctor or physiotherapist.</li>
          <li><strong>Measurements are estimates.</strong> Angles from a camera are not goniometer readings. The checks that were done are listed on the <a href="/review/">Clinical review</a> page. A flag means &ldquo;a pattern for the physiotherapist to look at&rdquo;, never a diagnosis.</li>
          <li><strong>After a stroke, exercise with a physiotherapist&rsquo;s advice.</strong> Use the prescription they give you. Stop at once if there is pain, and use the stop button.</li>
          <li><strong>Use at your own risk.</strong> To the extent the law allows, the operator is not liable for injury or loss from using the app, and the app is provided as it is, without a warranty.</li>
          <li><strong>Do not misuse it.</strong> Do not try to break the site, bypass its limits or use it to record other people without their consent.</li>
          <li>These terms are governed by the laws of India. Courts at the operator&rsquo;s registered place have jurisdiction.</li>
        </ul>

        <h2 id="safety">Emergency</h2>
        <p className="note-bad" lang="en">{SAFETY.en.emergency}</p>
      </main>
      <Footer />
    </div>
  )
}
