# Ask Vabrato: member wording for Mark's review

Every message, label and note members see from Ask Vabrato, the assistant in /my, grouped by where it shows. Generated from the code (`apps/web/src/review/wording-sheet.ts`), so it matches what members see. Answers themselves are written by the model and checked by our code; they aren't listed here. No AI feature is switched on yet.

For each group, tick "keep" or write the change. Pending items from the staff assistant (S6b) are at the end.

## 1. Labels on AI output

- AI draft
- AI draft · You send it
- Suggested
- AI concept

Mark: ☐ keep as is  ☐ change (note below)

## 2. Notes on the pages and answer cards

| Where | Wording |
| --- | --- |
| Ask Vabrato page (top) | Answers are written by AI and can be wrong. Check anything important with your agent. / Nothing you type is kept unless you save a draft, add a to-do or send a flyer: leaving this page clears the rest. Your agent doesn't see your questions or drafts, only to-dos you add, flyers you send and messages you send them. / It never gives legal, tax or wiring advice. Always call your escrow officer to verify wiring instructions. |
| Ask Vabrato page, switched off | Ask Vabrato, our assistant, isn't switched on yet. Your agent is happy to help in the meantime: |
| Ask Vabrato page, daily limit 0 | Ask Vabrato isn't available on your account right now. |
| Explain a term (answer) | Written by AI and can be wrong. Not legal or tax advice: ask your agent about your own situation. |
| Search by sentence (answer) | Check the filters before you run it. Nothing is saved: to get alerts, use "Save search" on the results. |
| Summarize a document (answer) | Written by AI from your document and can be wrong. Not legal, engineering or tax advice. Your agent sees to-dos you add, not this summary. |
| Summarize a document (to-dos) | Tick the ones you want. Your agent sees and approves to-dos you add. |
| Offer cover letter (draft) | Your agent reviews it before it goes with your offer. Cover letters are about your offer only (Fair Housing). |
| Compare homes and Ask about a home (answer) | Written by AI from the listing and can be wrong. Not legal or tax advice, and not an appraisal or price opinion: ask your agent. |
| Compare page | Uses only these homes' listing facts. Nothing is saved. |
| Moving plan and pre-listing checklist (answer) | Written by AI and can be wrong. Not legal or tax advice. Dates from your sale come from your agent's schedule; confirm anything important with your agent. |
| Moving plan (dates of record) | Ask Vabrato never changes these. Confirm them with your agent. |
| Moving plan and pre-listing checklist (dropped steps) | Some suggestions were left out because they named contract dates, costs or price opinions. Your agent handles those. |
| Plan a tour day (answer) | Order worked out by our code from open-house times and straight-line distance. Listing data: MLSListings. |
| Colors and moodboard (answer) | AI concept for planning only. Screen colors vary: test a sample on the wall first. Listing photos must always show the real home. |
| Staging ideas (answer) | Written by AI and can be wrong. Ideas for planning only: listing photos must show the real home. Check bigger changes with your agent. |
| Staging ideas (dropped ideas) | Some ideas mentioned costs or value and were left out. Your agent can help with those. |
| Open-house flyer and posts (card) | Written by AI from your words and can be wrong. Nothing is posted for you: once approved, you copy the posts and print the flyer yourself. |
| Open-house flyer and posts (sent) | Sent to your agent. They approve it and add your listing, the open-house time and their details. |
| My flyers (approved flyer, posts) | Approved by your agent. The brokerage line is added at the end. Post them yourself, with your own photos of the home. |
| Delete my assistant data (confirmation) | Delete your assistant data? Your saved drafts, your flyers, and to-dos waiting for your agent or declined are removed. Approved to-dos stay. |

Mark: ☐ keep as is  ☐ change (note below)

## 3. The modes: buttons, field names and hints

| Mode | Field | Hint under the field |
| --- | --- | --- |
| Explain a term | The term or question | For example: What does "contingency removal" mean? |
| Search by sentence | Describe the homes you're looking for | For example: 3-bed house in San Carlos under $2.5M. |
| Summarize a document | Which document | Up to 50 pages: PDFs, JPGs, PNGs or WebP images (not iPhone photos, HEIC). Pick from your documents. |
| Draft an email or message | What should it say? | For example: Ask the movers for a date the week after we close. Your notes and the home's address are sent; your name and contact details aren't. |
| Offer cover letter | What makes your offer strong? | Price, timing, flexibility, preapproval. Leave out anything about your family, background, faith, age or health (Fair Housing). |
| Compare homes | Homes to compare | Pick 2 to 4 of your saved homes. Only the listing facts you can see are used; nothing about you is sent. |
| Ask about a home | Your question | For example: How big is the lot? Answers come from the listing only. |
| Build my moving schedule | Anything to plan around? (optional) | For example: a piano, two cats, a storage unit. Only the move day and these notes are sent. |
| Pre-listing checklist | Notes on the home (optional) | For example: old carpet in the den, a dripping faucet. No costs or prices are given. |
| Plan a tour day | Homes to see | Pick 2 to 6 saved homes. Our code puts them in order (open houses first, then distance); Ask Vabrato adds what to look at. |
| Colors and moodboard | The room or the look you want | For example: a north-facing living room with oak floors; we want it warmer and calmer. Only these notes are sent. |
| Staging ideas | Describe the room | Size, light, furniture, what bothers you. No photos are sent; ideas are for planning only. |
| Open-house flyer and posts | What do you love about your home? | Light, updates, the yard, the layout. Only your words are sent: your agent adds the address, price, photo and open-house time when they approve it. |

Mark: ☐ keep as is  ☐ change (note below)

## 4. When Ask Vabrato can't answer

General (any mode):

| Key | Wording |
| --- | --- |
| `off` | Ask Vabrato isn't switched on right now. |
| `daily_requests` | You've reached today's limit for Ask Vabrato. It resets at midnight Pacific time. |
| `daily_tokens` | You've reached today's limit for Ask Vabrato. It resets at midnight Pacific time. |
| `monthly_budget` | Ask Vabrato isn't available for the rest of this month. Your agent is happy to help: send them a message. |
| `fair_housing_input` | We can't search for, describe or rate homes or areas by who lives there, or rate areas as safe or good (Fair Housing). Ask about the home itself, distances, transit or parks. For schools, see the school district's own website or the California Department of Education; for fair housing, see hud.gov. |
| `fair_housing_output` | The answer used wording we can't use under Fair Housing rules, so it isn't shown. Try asking another way. |
| `payment_instructions` | The answer isn't shown because it mentioned payment or wiring details. Ask Vabrato never gives those. Always call your escrow officer to verify wiring instructions. |
| `refused` | Ask Vabrato couldn't help with that. Try asking another way, or ask your agent. |
| `invalid_output` | The answer didn't come through properly. Please try again. |
| `busy` | Ask Vabrato is busy right now. Please try again in a minute. |
| `too_large` | That's too long for Ask Vabrato. Try a shorter question. |
| `error` | Something went wrong. Please try again. |

Documents:

| Key | Wording |
| --- | --- |
| `notFound` | We couldn't find that document. It may have been removed. |
| `heic` | Ask Vabrato can't read iPhone photos (HEIC). Upload it as a PDF or JPG, or ask your agent. |
| `unreadable` | Ask Vabrato reads PDFs, JPGs, PNGs and WebP images only. |
| `tooBig` | This file is larger than 20 MB, so Ask Vabrato can't read it. Your agent can help with it. |
| `tooLong` | This document has 72 pages. Ask Vabrato reads up to 50; your agent can help with longer ones. (example: 72) |
| `uncounted` | We couldn't check how long this PDF is, and it's large. Ask Vabrato reads up to 50 pages; your agent can help with it. |

Drafts and cover letters:

| Key | Wording |
| --- | --- |
| `noNotes` | Tell Ask Vabrato what the message should say. |
| `noLetterNotes` | Tell Ask Vabrato what makes your offer strong. |
| `home` | That home isn't one of yours. Pick one from the list. |
| `payment` | Leave out bank, account or wiring details. Ask Vabrato never writes those, and you should always call your escrow officer to verify wiring instructions. |
| `personal` | Cover letters here are about your offer only: leave out anything about you or your family, background, faith, age or health, and photos. Fair Housing rules mean a seller shouldn't choose a buyer on those. Try again with the offer's strengths (price, timing, flexibility, preapproval). |
| `personalOutput` | The letter mentioned personal details we leave out of cover letters, so it isn't shown. Please try again. |
| `empty` | The draft didn't come through properly. Please try again. |
| `coverOnly` | Offer cover letters are for buyers. |

Compare and listing questions:

| Key | Wording |
| --- | --- |
| `value` | Ask Vabrato doesn't give price or value opinions. Your agent can prepare a market analysis for you. |
| `money` | The answer used a figure that isn't in the listing, so it isn't shown. Please try again, or ask your agent. |
| `tooFew` | Pick at least two homes to compare. |
| `noneSent` | None of these homes can be compared by Ask Vabrato: their sellers asked that listings not be used this way. Your agent can compare them with you. |
| `optedOut` | The seller asked that this listing not be used by AI tools, so Ask Vabrato can't answer about it. Your agent can help. |
| `notFound` | That home isn't available to you. Pick one of your saved or tracked homes. |
| `noQuestion` | Type your question about the home. |
| `empty` | The answer didn't come through properly. Please try again. |

Moving plans, checklists and tour days:

| Key | Wording |
| --- | --- |
| `noDate` | Choose the date to plan from. |
| `pastDate` | Pick a date from today on. |
| `farDate` | Pick a date within the next year. |
| `noSale` | There's no open sale on your account to plan from. Type your move date instead. |
| `payment` | Leave out bank, account or wiring details. Ask Vabrato never writes those, and you should always call your escrow officer to verify wiring instructions. |
| `empty` | The plan didn't come through properly. Please try again. |
| `tooFew` | Pick 2 to 6 of your saved homes. |
| `noneSent` | None of these homes can be planned by Ask Vabrato: their sellers asked that listings not be used this way. The order is below; your agent can help. |
| `value` | Ask Vabrato doesn't give price or value opinions. Your agent can help with that. |
| `money` | The plan used a figure that isn't in the listings, so it isn't shown. Please try again. |
| `tourDate` | Pick a tour date from today to 60 days out. |

Colors, staging, flyers:

| Key | Wording |
| --- | --- |
| `noNotes` | Tell Ask Vabrato a little about the room or the look you want. |
| `noFlyerNotes` | Tell Ask Vabrato what you love about your home: light, updates, the yard, the layout. |
| `payment` | Leave out bank, account or wiring details. Ask Vabrato never writes those, and you should always call your escrow officer to verify wiring instructions. |
| `empty` | The answer didn't come through properly. Please try again. |
| `tooFewColors` | The palette didn't come through properly. Please try again. |
| `value` | Ask Vabrato doesn't give price or value opinions, and the flyer's price comes from your listing. Please try again. |
| `sellersOnly` | This is for sellers. |

Mark: ☐ keep as is  ☐ change (note below)

## 5. What each switch does (shown to admins on the console's Assistant page)

| Feature | What it does | Needs MLSListings approval |
| --- | --- | --- |
| Explain a term | Explains a real-estate term in plain language (escrow, contingency, disclosures and the like). Not legal or tax advice; the member can pass the question to their agent. Nothing is kept. | No |
| Search by sentence | Turns a sentence ("3-bed house in San Carlos under $2.5M") into the website's normal search filters. The member sees the filters and runs or saves the search themselves. Nothing is kept. | No |
| Summarize a document | Summarizes one of the member's documents (their uploads, or files their agent shared; 50 pages at most) with page references, and suggests questions and to-dos. The summary isn't kept. To-dos the member adds wait for their agent's approval on the member's page here. | No |
| Draft an email or message | Drafts an email or message for the member to their movers, a contractor, their lender, their agent or someone else. Only the home's address (and a sale's closing date) goes with their notes. The member edits and sends it themselves; AI never sends. Saved drafts are private to the member (not shown here) and deleted 30 days after the last edit. | No |
| Offer cover letter | For buyers: a cover letter about the offer's terms only (price, timing, flexibility, preapproval). Notes about the buyer's family, background, faith, age or health are refused (Fair Housing). The letter goes to the agent only, as a portal message the member sends. | No |
| Compare homes | Compares 2 to 4 of the member's saved homes from the listing fields they may see (IDX, or VOW once accepted): differences and questions for their agent. No price opinions. Homes whose sellers opted out of automated valuations or comments are never sent. Needs the MLSListings approval switch. Nothing is kept. | Yes |
| Ask about a home | Answers a member's question about one home from the listing fields they may see, naming the fields it used. No price opinions; anything the listing doesn't say goes to their agent. Opted-out homes are never sent. Needs the MLSListings approval switch. Nothing is kept. | Yes |
| Moving plan | A moving plan with dated steps. A seller's plan counts from their sale's closing date in the schedule engine (never changed, "confirm with your agent"); a buyer types their move date. Only that date, buyer or seller, and the member's notes are sent. Steps the member adds go to their to-dos for their agent's approval; they can download a calendar file. The plan isn't kept. | No |
| Pre-listing checklist | For sellers: a checklist counted back from a list date they type (repairs, cleaning, staging, photos, paperwork with their agent). No cost estimates or price opinions. Items the member adds go to their to-dos for their agent's approval. The checklist isn't kept. | No |
| Plan a tour day | For buyers: our code orders 2 to 6 saved homes (open houses first, then straight-line distance); the assistant adds what to look at in each from the listing fields they may see. Opted-out homes are never sent. Needs the MLSListings approval switch. Nothing is kept. | Yes |
| Colors and moodboard | A color palette and a moodboard from the member's notes about a room or a style. The assistant picks the colors and names; our code checks them and draws the swatches. Labelled an AI concept for planning only. Nothing is kept. | No |
| Staging ideas | For sellers: ideas for staging a room they describe in words (no photos are sent): what to keep, remove, add and how to arrange it, with a few accent colors. No costs or price opinions. Ideas the member adds go to their to-dos for their agent's approval. Nothing else is kept. | No |
| Open-house flyer and posts | For sellers: a headline, highlights, a short description and Instagram and Facebook posts, written only from the seller's own words (no listing data is sent). The seller sends it to their agent, who approves it here on the member's page and picks our listing and open house; the flyer's facts, photo and agent card then come from our records. | No |

Mark: ☐ keep as is  ☐ change (note below)

## 6. Pending from the staff assistant (S6b)

### 6a. Fair Housing wording list (S6b PR 9)

Blocked in anything the assistant writes or a member types (familial status): "no kids", "no children", "without kids", "adults only", "perfect for families", "no families", "no families with kids", "without families", "not for families", "not suitable / suited / ideal / good / great / safe / right / meant / intended for kids / children / families", "children / kids / families (are) not allowed / permitted / welcome", "no young children".

Allowed: "family room", "no family room", "kids' bedroom", "no children's play structure", "children's play area in the park nearby", "the seller's children will move the furniture", "single-family home", "55+ community" (housing for older persons is a lawful exemption).

Mark: ☐ keep as is  ☐ change (note below)

### 6b. Seller-type checklist rows marked "(confirm)" (S6b PR 7a)

| Document | Seller types | Note shown | Kind |
| --- | --- | --- | --- |
| TDS, or Exempt Seller Disclosure (ESD) | trust, successor trustee | A trustee may be exempt from the TDS | Required |
| Exempt Seller Disclosure (ESD) | probate | Probate sales are exempt from the TDS and SPQ | Required |
| Seller Property Questionnaire (SPQ) | standard, trust |  | Required |
| SPQ, or Exempt Seller Disclosure (ESD) | successor trustee |  | Required |
| Water-conserving fixtures and carbon monoxide detector notice (WCMD) | all |  | Required |
| Trust Advisory (TA) | trust, successor trustee |  | Required |
| Probate purchase agreement addendum (PAPA) | probate |  | Required |
| Probate listing addendum (PLA) | probate |  | Required |
| Water heater and smoke detector statement (WHSD) | all |  | If it applies |
| Residential listing agreement (RLA) | all |  | If it applies |
| Seller's Advisory (SA) | all |  | If it applies |
| Fair Housing and discrimination advisory (FHDA) | all |  | If it applies |
| Possible representation of more than one buyer or seller (PRBS) | all |  | If it applies |
| Wire Fraud Advisory (WFA) | all |  | If it applies |
| Short sale or foreclosure information (SFLS) | all |  | If it applies |
| Seller withholding (FIRPTA / California 593) | all |  | If it applies |
| HOA documents | all | If the home is in an HOA | If it applies |
| County or local advisory | all |  | If it applies |

Mark: for each row ☐ keep  ☐ drop

### 6c. Repair-response wording (S6b PR 7b)

| Where | Wording |
| --- | --- |
| Last line of the response | This summary is for convenience; the signed Request for Repair response form governs. |
| Each item the seller will repair | Seller will repair, by a licensed contractor before close of escrow |

Mark: ☐ keep as is  ☐ change (note below)

---

Signed: ____________________  Date: ____________
