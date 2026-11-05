# Validation session plan (about 90 minutes)

Goal: show how far the on-screen angle is from a goniometer, on the equipment and in the room the app will really be used. Pass = at least 20 readings and a mean error of 10 degrees or less (the page checks this and prints the block for `src/release.json`).

## Before

- **People:** at least 3 volunteers, ideally including 1 or 2 patients the physiotherapist is already treating. The page only counts readings, not people, so take readings from several people: one person's 20 readings say little.
- **Consent:** each person agrees (the page asks). Nothing is uploaded; only the numbers you record are saved in that browser.
- **Equipment:** the phone or laptop patients will actually use, on a stand at chest height; a plain chair without arms; a tape mark 2 m from the camera; good, even light; a plain background; one goniometer.
- **Build:** the pilot build, served over HTTPS (or localhost). Use one browser profile for the whole session so all readings stay together.

## Readings per person (16)

| Joint | Camera view | Arm | Angles to hold |
|---|---|---|---|
| Shoulder | Side-on | right, then left | 20, 45, 60, 90, 120, 150 |
| Shoulder | Front-on | right | 30, 60, 90, 120 |
| Elbow bend | Side-on | right | 30, 60, 90, 120 |

Hold each angle still, read the goniometer, type it, press Record. The page refuses the reading if the arm moved more than 6 degrees or tracking dropped; just hold still and press again.

## Order

1. **3D method first** (the default). Take all readings for all people. Do not mix in 2D.
2. Download the CSV and note the device, camera height and distance in the file name.
3. Press Clear all, then repeat a shorter set (the 90-degree and 150-degree shoulder angles, both arms, every person) with the **2D** method. This is only to compare. If 2D is clearly better, change the default in `src/pages/Coach.tsx` (`useState<Method>`) and repeat the full 3D-style set with 2D before signing.
4. Look at the result panel: readings, mean error, bias, largest error.

## Decide

| Result (3D, all readings) | Do |
|---|---|
| 20 or more readings, mean error up to 10° | Pass. Paste the printed block into `release.json`. Keep the CSV with the signed review. |
| 10° to 15° | Fix the setup (camera height, distance, light, side-on exactly), repeat. Try 2D. |
| Above 15°, or large one-sided bias | Do not release with angles. Either change the app to count repetitions without showing angles, or stop. |
| Largest errors at one joint or one end of the range | Note it for the physiotherapist: that exercise's target range may need narrowing. |

## Also while the physiotherapist is there

- Run the Coach in camera mode with each volunteer for one short set of each exercise. Check that the rep count matches what the physiotherapist counts by eye, and that flags (trunk lean, bent elbow) match what they would flag. Write down every mismatch.
- With a patient, check the resting calibration (arm hanging for a second). If the arm cannot hang freely, note it.
- Test pain stop, the safety checklist and the emergency text with someone reading aloud.
- Walk through `/review/` together and sign it.
