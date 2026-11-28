import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont


def build_crisp_qr(qr_path: str, module_px: int = 56) -> Image.Image:
    """Reconstruct crisp pixel-exact QR modules from the uploaded 29x29 QR image."""
    raw = Image.open(qr_path).convert("L")
    bbox = raw.point(lambda p: 255 if p < 128 else 0).getbbox()
    cropped = raw.crop(bbox)

    modules = 29
    step = cropped.width / modules
    grid_img = Image.new("RGB", (modules, modules), (255, 255, 255))
    pixels = grid_img.load()

    for y in range(modules):
        cy = int((y + 0.5) * step)
        for x in range(modules):
            cx = int((x + 0.5) * step)
            is_dark = cropped.getpixel((cx, cy)) < 128
            pixels[x, y] = (15, 9, 5) if is_dark else (255, 255, 255)

    target_size = modules * module_px
    return grid_img.resize((target_size, target_size), Image.Resampling.NEAREST)


def get_font(names: list[str], size: int) -> ImageFont.FreeTypeFont:
    font_dir = "C:/Windows/Fonts"
    for name in names:
        path = os.path.join(font_dir, name)
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def add_soft_shadow(
    canvas: Image.Image,
    rect: tuple[int, int, int, int],
    radius: int,
    offset_y: int = 18,
    blur_radius: int = 28,
    color: tuple[int, int, int, int] = (34, 19, 11, 52),
) -> Image.Image:
    """Render a smooth Gaussian-blurred drop shadow composited onto canvas."""
    shadow_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow_layer)
    x0, y0, x1, y1 = rect
    s_draw.rounded_rectangle(
        [(x0, y0 + offset_y), (x1, y1 + offset_y)],
        radius=radius,
        fill=color,
    )
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(blur_radius))
    return Image.alpha_composite(canvas, shadow_layer)


def create_a4_poster():
    # A4 Dimensions at 300 DPI: 2480 x 3508 pixels
    width = 2480
    height = 3508

    # 1. Background: Rich Warm Sand/Cream Gradient matching standee banner
    base = Image.new("RGBA", (width, height), (250, 244, 234, 255))
    draw = ImageDraw.Draw(base)

    top_color = (250, 244, 234)  # #FAF4EA
    mid_color = (242, 226, 200)  # #F2E2C8
    bot_color = (232, 208, 173)  # #E8D0AD

    for y in range(height):
        if y < height * 0.5:
            t = y / (height * 0.5)
            r = int(top_color[0] + (mid_color[0] - top_color[0]) * t)
            g = int(top_color[1] + (mid_color[1] - top_color[1]) * t)
            b = int(top_color[2] + (mid_color[2] - top_color[2]) * t)
        else:
            t = (y - height * 0.5) / (height * 0.5)
            r = int(mid_color[0] + (bot_color[0] - mid_color[0]) * t)
            g = int(mid_color[1] + (bot_color[1] - mid_color[1]) * t)
            b = int(mid_color[2] + (bot_color[2] - mid_color[2]) * t)
        draw.line([(0, y), (width, y)], fill=(r, g, b, 255))

    # Fonts matching standee banner's bold clean aesthetic
    font_wordmark = get_font(["seguibl.ttf", "ariblk.ttf", "segoeuib.ttf", "arialbd.ttf"], 170)
    font_title = get_font(["segoeuib.ttf", "arialbd.ttf", "calibrib.ttf"], 66)
    font_pi = get_font(["segoeuib.ttf", "arialbd.ttf"], 60)
    font_email = get_font(["segoeuib.ttf", "arialbd.ttf"], 54)
    font_dept = get_font(["seguisb.ttf", "segoeuib.ttf", "arial.ttf"], 39)

    # 2. Decorative Standee Double Frame & Corner Brackets
    margin_out = 72
    draw.rectangle(
        [(margin_out, margin_out), (width - margin_out, height - margin_out)],
        outline="#D5B584",
        width=5,
    )
    margin_in = 90
    draw.rectangle(
        [(margin_in, margin_in), (width - margin_in, height - margin_in)],
        outline="#3D2819",
        width=2,
    )

    bracket_len = 88
    for cx, cy, dx, dy in [
        (margin_out, margin_out, 1, 1),
        (width - margin_out, margin_out, -1, 1),
        (margin_out, height - margin_out, 1, -1),
        (width - margin_out, height - margin_out, -1, -1),
    ]:
        draw.line([(cx, cy), (cx + dx * bracket_len, cy)], fill="#B58943", width=9)
        draw.line([(cx, cy), (cx, cy + dy * bracket_len)], fill="#B58943", width=9)

    # 3. Header: Horizontal Lockup ([Shield Emblem] TraceX) + Project Title
    emblem_path = "public/images/tracex-icon.png"
    emblem_resized = None
    emblem_w, emblem_h = 0, 0
    if os.path.exists(emblem_path):
        raw_emblem = Image.open(emblem_path).convert("RGBA")
        alpha_bbox = raw_emblem.getchannel("A").getbbox()
        if alpha_bbox:
            raw_emblem = raw_emblem.crop(alpha_bbox)
        target_h = 210
        ratio = target_h / raw_emblem.height
        emblem_w = int(raw_emblem.width * ratio)
        emblem_h = target_h
        emblem_resized = raw_emblem.resize((emblem_w, emblem_h), Image.Resampling.LANCZOS)

    text_trace = "Trace"
    text_x = "X"
    bbox_t = draw.textbbox((0, 0), text_trace, font=font_wordmark)
    bbox_x = draw.textbbox((0, 0), text_x, font=font_wordmark)
    w_trace = bbox_t[2] - bbox_t[0]
    w_x = bbox_x[2] - bbox_x[0]
    h_word = max(bbox_t[3] - bbox_t[1], bbox_x[3] - bbox_x[1])

    logo_gap = 34 if emblem_resized else 0
    lockup_w = emblem_w + logo_gap + w_trace + w_x
    lockup_x = (width - lockup_w) // 2
    y_lockup_top = 180

    if emblem_resized:
        base.paste(emblem_resized, (lockup_x, y_lockup_top), emblem_resized)

    word_x_start = lockup_x + emblem_w + logo_gap - bbox_t[0]
    word_y_start = y_lockup_top + (emblem_h - h_word) // 2 - bbox_t[1] - 4
    draw.text((word_x_start, word_y_start), text_trace, font=font_wordmark, fill="#1E1109")
    draw.text((word_x_start + w_trace + 2, word_y_start), text_x, font=font_wordmark, fill="#A6824B")

    # Project Title directly below TraceX
    title_line1 = "A Blockchain-Based Real-Time Smart"
    title_line2 = "Supply Chain Traceability System"
    for line, y_line in [(title_line1, 432), (title_line2, 514)]:
        b = draw.textbbox((0, 0), line, font=font_title)
        lw = b[2] - b[0]
        draw.text(((width - lw) // 2 - b[0], y_line), line, font=font_title, fill="#22130B")

    # Subtle centered gold accent divider
    div_w = 420
    div_y = 626
    draw.line([((width - div_w) // 2, div_y), ((width + div_w) // 2, div_y)], fill="#C59B52", width=4)

    # 4. Hero Centerpiece: Prominent Oversized QR Code Card
    qr_size = 29 * 56  # 1624 x 1624 px (~137.5 mm)
    card_pad = 168     # 168 px (~14.2 mm quiet zone all around)
    card_size = qr_size + card_pad * 2  # 1960 x 1960 px (~166 mm)
    card_x = (width - card_size) // 2
    card_y = 685

    # Soft blurred shadow composited cleanly onto canvas
    base = add_soft_shadow(
        base,
        (card_x, card_y, card_x + card_size, card_y + card_size),
        radius=54,
        offset_y=20,
        blur_radius=32,
        color=(34, 19, 11, 50),
    )

    # Bottom Principal Investigator Card shadow as well
    contact_w = 2120
    contact_h = 500
    contact_x = (width - contact_w) // 2
    contact_y = 2785

    base = add_soft_shadow(
        base,
        (contact_x, contact_y, contact_x + contact_w, contact_y + contact_h),
        radius=36,
        offset_y=16,
        blur_radius=26,
        color=(25, 14, 8, 56),
    )

    # Re-create draw handle after alpha_composite
    draw = ImageDraw.Draw(base)

    # White QR Card with Espresso & Gold Double Framing
    draw.rounded_rectangle(
        [(card_x, card_y), (card_x + card_size, card_y + card_size)],
        radius=52,
        fill="#FFFFFF",
        outline="#3D2819",
        width=5,
    )
    draw.rounded_rectangle(
        [(card_x + 18, card_y + 18), (card_x + card_size - 18, card_y + card_size - 18)],
        radius=42,
        outline="#D5B584",
        width=3,
    )

    # Paste sharp reconstructed QR code
    qr_path = "public/images/tracex-qr-code.png"
    if os.path.exists(qr_path):
        qr_img = build_crisp_qr(qr_path, module_px=56)
        qr_pos = (card_x + card_pad, card_y + card_pad)
        base.paste(qr_img, qr_pos)

    # 5. Bottom Contact Card: Principal Investigator & Email
    draw.rounded_rectangle(
        [(contact_x, contact_y), (contact_x + contact_w, contact_y + contact_h)],
        radius=36,
        fill="#22130B",
        outline="#C59B52",
        width=4,
    )
    draw.rounded_rectangle(
        [(contact_x + 14, contact_y + 14), (contact_x + contact_w - 14, contact_y + contact_h - 14)],
        radius=28,
        outline="#5A3B28",
        width=2,
    )

    # Principal Investigator Name
    pi_full = "Principal Investigator: Dr. Kashif Mehboob Khan"
    b_pi = draw.textbbox((0, 0), pi_full, font=font_pi)
    pi_w = b_pi[2] - b_pi[0]
    draw.text(((width - pi_w) // 2 - b_pi[0], contact_y + 66 - b_pi[1]), pi_full, font=font_pi, fill="#FAF4EA")

    # Prominent Email Pill
    email_display = "Contact:  kashifmehboob@neduet.edu.pk"
    b_em = draw.textbbox((0, 0), email_display, font=font_email)
    em_w = b_em[2] - b_em[0]
    em_h = b_em[3] - b_em[1]
    pill_w = em_w + 136
    pill_h = 108
    pill_x = (width - pill_w) // 2
    pill_y = contact_y + 190

    draw.rounded_rectangle(
        [(pill_x, pill_y), (pill_x + pill_w, pill_y + pill_h)],
        radius=54,
        fill="#3A2215",
        outline="#D4AF67",
        width=3,
    )
    draw.text(
        ((width - em_w) // 2 - b_em[0], pill_y + (pill_h - em_h) // 2 - b_em[1]),
        email_display,
        font=font_email,
        fill="#FFE29E",
    )

    # Department & University
    dept_line = "Department of Software Engineering  •  NED University of Engineering & Technology, Karachi"
    b_dep = draw.textbbox((0, 0), dept_line, font=font_dept)
    dep_w = b_dep[2] - b_dep[0]
    draw.text(
        ((width - dep_w) // 2 - b_dep[0], contact_y + 365 - b_dep[1]),
        dept_line,
        font=font_dept,
        fill="#E6D0B3",
    )

    # 6. Export 300 DPI Outputs
    out_dir = "public/images"
    os.makedirs(out_dir, exist_ok=True)
    out_png = os.path.join(out_dir, "tracex-a4-poster-300dpi.png")
    out_jpg = os.path.join(out_dir, "tracex-a4-poster-print.jpg")

    final_rgb = base.convert("RGB")
    final_rgb.save(out_png, dpi=(300, 300), quality=98)
    final_rgb.save(out_jpg, dpi=(300, 300), quality=96)
    print("Successfully generated clean A4 poster at 300 DPI:")
    print(" -", out_png)
    print(" -", out_jpg)


if __name__ == "__main__":
    create_a4_poster()
