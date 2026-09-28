from image_service import GeneratorService, Mode, Category

svc = GeneratorService()

def progress(ev):
    # ev: {"stage": "...", "pct": int, ...}
    print(ev)

# Тип 1 — портрет (SFW)
res1 = svc.generate_portrait(
    mode=Mode.anime,
    appearance="1girl, pink hair, slim body, soft light, portrait",
    base_prompt="clean background, subtle depth of field",
    negative_prompt="glasses",
    progress=progress
)
print(res1["final_path"])

# # Тип 2 — text2img (SFW/NSFW)
res2 = svc.generate_text2img(
    mode=Mode.realistic,
    category=Category.nsfw,                # или Category.avatar
    user_prompt="woman lying on bed, soft light",
    progress=progress
)

# Тип 3 — img2img диалог
res3 = svc.generate_img2img_dialogue(
    mode=Mode.realistic,             # режим модели: 'anime' или 'realistic' (какой чекпойнт использовать)
    init_image_path="images/maks.jpg",  # путь к исходному изображению персонажа (портрет/фото)
    user_prompt="nsfw, bedroom, soft light, lingerie, full body, naked, looging at viewer",  
    # текстовый промт, описывающий сцену (NSFW/SFW, окружение, стиль, поза и т. д.)

    gender="male",                   # уточнение пола персонажа: 'male' или 'female' (усилитель для промта)
    keep_face=True,                 # сохранять ли лицо через IP-Adapter (True = лучше держит идентичность)
    use_controlnet=False,            # использовать ли ControlNet (OpenPose и др.) для поз/композиции
    strength=0.1,                    # сила img2img: 
                                     # - ближе к 0 = сильнее сохраняет исходное фото
                                     # - ближе к 1 = больше изменений под промт
    steps=20,                        # количество шагов денойзинга (качество/детализация; 20 — среднее)
    guidance_scale=8,                # «CFG scale»: насколько строго следовать промту
                                     # - 1 = почти игнорирует текст
                                     # - 6–8 = оптимальный баланс
                                     # - слишком высоко = пересвет, артефакты
    progress=progress                # колбэк для отслеживания прогресса (если нужен статус по шагам)
)
