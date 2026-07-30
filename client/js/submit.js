(() => {
  const $ = (id) => document.getElementById(id);

  function normalizePhoneDigits(raw) {
    const digits = String(raw || "").replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
    return digits;
  }

  function formatPhone(raw) {
    const digits = normalizePhoneDigits(raw);
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return String(raw || "");
  }

  function setStatus(message, kind = "") {
    const status = $("submissionStatus");
    status.textContent = message;
    status.className = `submission-status${kind ? ` ${kind}` : ""}`;
  }

  function isEmbedMode() {
    const params = new URLSearchParams(window.location.search);
    return params.get("embed") === "1" && window.parent !== window;
  }

  function postEmbedHeight() {
    if (!isEmbedMode()) return;

    const height = Math.ceil(Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight
    ));

    window.parent.postMessage({
      type: "xodia-dj-submission-height",
      height
    }, "*");
  }

  function initializeEmbedMode() {
    if (!isEmbedMode()) return;

    document.documentElement.classList.add("is-embedded");
    document.body.classList.add("is-embedded");
    postEmbedHeight();

    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(postEmbedHeight);
      observer.observe(document.body);
    } else {
      window.addEventListener("resize", postEmbedHeight);
    }

    window.addEventListener("load", postEmbedHeight);
  }

  function getGenreValue() {
    const selectedGenres = Array.from(document.querySelectorAll('input[name="genre"]:checked'))
      .map((checkbox) => checkbox.value)
      .filter((genre) => genre !== "Other");

    if ($("genreOtherCheckbox").checked) {
      const customGenre = $("genreOther").value.trim();
      selectedGenres.push(customGenre || "Other");
    }

    return selectedGenres.join(", ");
  }

  function getHeardAboutValue() {
    const selectedValue = $("heardAbout").value.trim();
    return selectedValue === "Other" ? $("heardAboutOther").value.trim() : selectedValue;
  }

  function resetConditionalFields() {
    $("genreOther").hidden = true;
    $("genreOther").value = "";
    $("heardAboutOther").hidden = true;
    $("heardAboutOther").value = "";
  }

  async function submitProfile(event) {
    event.preventDefault();
    const form = $("submissionForm");

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const button = $("submitButton");
    button.disabled = true;
    button.textContent = "Submitting...";
    setStatus("");

    const payload = {
      stageName: $("stageName").value.trim(),
      fullName: $("fullName").value.trim(),
      genre: getGenreValue(),
      city: $("city").value.trim(),
      state: $("state").value.trim(),
      phoneNumber: normalizePhoneDigits($("phoneNumber").value),
      experienceLevel: $("experienceLevel").value.trim(),
      age: $("age").value.trim(),
      email: $("email").value.trim(),
      socialMedia: $("socialMedia").value.trim(),
      heardAbout: getHeardAboutValue()
    };

    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Submission failed. Please try again.");
      }

      form.reset();
      resetConditionalFields();
      setStatus("Your profile was submitted and is awaiting approval.", "success");
    } catch (error) {
      setStatus(error.message || "Submission failed. Please try again.", "error");
    } finally {
      button.disabled = false;
      button.textContent = "Submit for Approval";
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    initializeEmbedMode();
    $("submissionForm").addEventListener("submit", submitProfile);

    $("phoneNumber").addEventListener("blur", () => {
      $("phoneNumber").value = formatPhone($("phoneNumber").value);
    });

    $("genreOtherCheckbox").addEventListener("change", () => {
      const otherField = $("genreOther");
      otherField.hidden = !$("genreOtherCheckbox").checked;
      if (!otherField.hidden) otherField.focus();
      else otherField.value = "";
    });

    $("heardAbout").addEventListener("change", () => {
      const otherField = $("heardAboutOther");
      otherField.hidden = $("heardAbout").value !== "Other";
      if (!otherField.hidden) otherField.focus();
      else otherField.value = "";
    });
  });
})();
