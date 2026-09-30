// DRAFT privacy policy written with Quebec's Law 25 in mind. Not legal advice: have it reviewed before public launch.
// Fill in the two placeholders in RESPONSIBLE below.

const RESPONSIBLE = {
  name: "[Your name], founder",
  contact: "[privacy contact email]",
};
const UPDATED = "September 28, 2026";

export default function Privacy() {
  return (
    <article className="prose">
      <div className="eyebrow">Last updated {UPDATED}</div>
      <h1>Privacy policy</h1>
      <p>
        Bonvoyage helps travelers plan trips using ratings from other travelers. This page explains what personal
        information we collect, why, where it is kept, and the choices you have.
      </p>

      <h2>Who is responsible</h2>
      <p>
        The person in charge of protecting personal information at Bonvoyage is {RESPONSIBLE.name}. Questions, requests
        and complaints go to {RESPONSIBLE.contact}. We answer within 30 days.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details.</strong> Your email address and a hashed password, or your Google account email if you sign in with Google.</li>
        <li><strong>Profile.</strong> The display name, username and home city you choose, and your taste and budget preferences.</li>
        <li><strong>Friends.</strong> Who you've added as a friend and pending requests.</li>
        <li><strong>Seat reports.</strong> For sports venues: the event, date, section, row, seat, price and view rating you enter.</li>
        <li><strong>Your contributions.</strong> Ratings, tags, what you say you spent, places you add, and photos you upload. Before upload, photos are resized and hidden details such as the GPS location where they were taken are removed.</li>
        <li><strong>Technical data.</strong> Our hosting providers keep standard server logs (such as IP address and time of request) for security.</li>
      </ul>
      <p>We don't collect payment details, precise location or contacts, and we don't sell personal information or show ads.</p>

      <h2>Why we use it</h2>
      <ul>
        <li>To run your account and keep you signed in.</li>
        <li>To show community scores. People who aren't your friends see the combined score for a place, not your individual ratings.</li>
        <li>To share with your friends. Friends you accept can see your ratings and your list, and that you rated a place. They can't see your email or your seat dates. Removing a friend stops this right away.</li>
        <li>To build seat guides. Others see averages and photos per section, never who sat where or when.</li>
        <li>To show your photos on the place's page. Photos are public, so avoid uploading pictures of people who haven't agreed to it.</li>
        <li>To personalize recommendations, including comparing your ratings with other travelers' to find people with similar taste. This is automated and only affects the order of suggestions shown to you.</li>
        <li>To prevent abuse such as fake ratings.</li>
      </ul>

      <h2>Where it is stored</h2>
      <p>
        Your data is stored with Supabase in its Canada (Central) region, and the website is served by Vercel. Some of
        these services may process data outside Quebec. [Before public launch: complete a privacy impact assessment for
        these providers, then replace this bracket with: "Before relying on them we assessed whether your information
        gets protection comparable to Quebec law."]
      </p>

      <h2>Cookies and browser storage</h2>
      <p>We store a sign-in token in your browser so you stay logged in. We don't use advertising or tracking cookies.</p>

      <h2>How long we keep it</h2>
      <p>
        We keep your information while your account is open. When you delete your account, your profile and ratings are
        deleted right away. Server logs are kept by our providers for a limited time.
      </p>

      <h2>Your rights</h2>
      <ul>
        <li><strong>Access and portability.</strong> Download all your data from your profile page.</li>
        <li><strong>Correction.</strong> Edit your profile and ratings at any time.</li>
        <li><strong>Deletion.</strong> Delete your account from your profile page.</li>
        <li><strong>Withdrawing consent.</strong> Stop using the service and delete your account.</li>
        <li><strong>Complaints.</strong> Contact us first. You can also contact the Commission d'accès à l'information du Québec.</li>
      </ul>

      <h2>Security incidents</h2>
      <p>
        If an incident puts your information at risk of serious harm, we will tell you and the Commission d'accès à
        l'information promptly, and we keep a record of all incidents.
      </p>

      <h2>Changes</h2>
      <p>If we change this policy in a way that affects you, we'll tell you by email or in the app before it takes effect.</p>
    </article>
  );
}
