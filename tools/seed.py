# -*- coding: utf-8 -*-
"""
种子数据生成器（单一数据源）。
运行一次后产出：
  - data/knowledge.json   （服务端持久化文件，仅含元数据，不含 content）
  - books/<catId>/<satId>.md  （每本书的正文，便于单独编辑）
  - js/seed.js            （前端离线兜底数据 window.SEED_DATA，含 content）
后续用户在界面里新增/删除的卫星只改 knowledge.json + 对应 .md，不影响本种子。
"""
import json
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CATEGORIES = [
    {"id": "sociology",  "name": "社会学",      "color": "#FF6B6B", "size": 1.25, "orbitRadius": 20.0,  "speed": 0.42,
     "satellites": [
         {"title": "乡土中国", "author": "费孝通", "summary": "读懂中国传统乡村社会结构与差序格局的奠基之作。",
          "tags": ["中国社会", "经典", "差序格局"],
          "content": "# 乡土中国\n\n**作者**：费孝通\n\n## 核心观点\n- **差序格局**：以「己」为中心，像石子投入水中泛起波纹，远近亲疏分明。\n- **礼治秩序**：乡土社会靠礼俗而非法律维持秩序。\n- **熟人社会**：世代定居、流动性低，信任建立在血缘与地缘之上。\n\n## 一句话\n读懂中国基层社会，先读懂「土气」与「熟人」二字。"},
         {"title": "乌合之众", "author": "古斯塔夫·勒庞", "summary": "群体心理经典，解释人为何会在群体中失去理性。",
          "tags": ["群体心理", "社会", "经典"],
          "content": "# 乌合之众\n\n**作者**：古斯塔夫·勒庞（Gustave Le Bon）\n\n## 要点\n1. 群体智力往往低于个体智力。\n2. 群体易被形象、口号、情绪感染，而非被逻辑说服。\n3. 领袖靠「断言、重复、传染」掌控群体。\n\n## 启发\n理解舆论、营销与政治动员，这本书是底层密码。"},
     ]},
    {"id": "psychology", "name": "心理学",      "color": "#4ECDC4", "size": 1.20, "orbitRadius": 24.5,  "speed": 0.38,
     "satellites": [
         {"title": "思考，快与慢", "author": "丹尼尔·卡尼曼", "summary": "系统1与系统2，揭示人类决策中的认知偏差。",
          "tags": ["认知偏差", "决策", "经典"],
          "content": "# 思考，快与慢\n\n**作者**：丹尼尔·卡尼曼（Daniel Kahneman）\n\n## 两个系统\n- **系统1**：直觉、快速、自动化，容易出错。\n- **系统2**：理性、缓慢、需费力，常被系统1绕过。\n\n## 常见偏差\n- 锚定效应、损失厌恶、可得性启发。\n\n## 用途\n投资、谈判、日常判断都该警惕系统1的偷懒。"},
         {"title": "被讨厌的勇气", "author": "岸见一郎 / 古贺史健", "summary": "用阿德勒心理学讲「课题分离」与自我接纳。",
          "tags": ["阿德勒", "自我成长", "心理学"],
          "content": "# 被讨厌的勇气\n\n**作者**：岸见一郎、古贺史健\n\n## 关键词\n- **课题分离**：谁的课题谁负责，不干涉他人也不被干涉。\n- **目的论**：人不是被过去决定，而是朝向目的行动。\n- **共同体感觉**：在「我与你」的关系中获得归属。\n\n## 一句话\n自由，就是有被讨厌的勇气。"},
     ]},
    {"id": "history",    "name": "历史",        "color": "#FFD166", "size": 1.35, "orbitRadius": 29.0,  "speed": 0.34,
     "satellites": [
         {"title": "万历十五年", "author": "黄仁宇", "summary": "以平淡一年为切口，看大明王朝的制度困局。",
          "tags": ["明史", "大历史", "经典"],
          "content": "# 万历十五年\n\n**作者**：黄仁宇\n\n## 大历史观\n从 1587 年这个「无事之年」切入，看明代文官制度、财政与皇权如何走向僵化。\n\n## 核心\n- 数目字管理的缺失。\n- 道德代替法律的治理困境。\n\n## 价值\n小切口、大纵深，是历史写作的范本。"},
     ]},
    {"id": "biography",  "name": "人物传记",    "color": "#F78FB3", "size": 1.10, "orbitRadius": 33.5,  "speed": 0.31,
     "satellites": [
         {"title": "史蒂夫·乔布斯传", "author": "沃尔特·艾萨克森", "summary": "苹果创始人的极致与偏执，一部创新者传记。",
          "tags": ["科技", "传记", "创新"],
          "content": "# 史蒂夫·乔布斯传\n\n**作者**：沃尔特·艾萨克森（Walter Isaacson）\n\n## 关键词\n- 现实扭曲力场\n- 极致简约的产品哲学\n- 跨界（科技 × 人文）\n\n## 启示\n伟大产品来自对完美的偏执，而非妥协。"},
     ]},
    {"id": "philosophy", "name": "哲学与宗教",  "color": "#A66CFF", "size": 1.30, "orbitRadius": 38.0,  "speed": 0.28,
     "satellites": [
         {"title": "沉思录", "author": "马可·奥勒留", "summary": "罗马皇帝写给自己的人生哲学，斯多葛派经典。",
          "tags": ["斯多葛", "古罗马", "自我"],
          "content": "# 沉思录\n\n**作者**：马可·奥勒留（Marcus Aurelius）\n\n## 斯多葛要义\n- 分清「可控」与「不可控」。\n- 当下即一切，死亡是自然。\n- 以理性约束情绪与欲望。\n\n## 一句话\n你拥有支配自己内心的力量，外界只是表象。"},
         {"title": "论语", "author": "孔子及其弟子", "summary": "儒家思想源头，修身齐家治国的根本经典。",
          "tags": ["儒家", "经典", "修身"],
          "content": "# 论语\n\n**作者**：孔子弟子及再传弟子编纂\n\n## 核心\n- 仁：爱人，推己及人。\n- 礼：社会秩序的规范。\n- 中庸：过犹不及。\n\n## 价值\n东亚文化圈的伦理地基，常读常新。"},
     ]},
    {"id": "politics",   "name": "政治军事",    "color": "#6C8EF5", "size": 1.28, "orbitRadius": 42.5,  "speed": 0.26,
     "satellites": [
         {"title": "孙子兵法", "author": "孙武", "summary": "东方兵学圣典，谋略与竞争的底层逻辑。",
          "tags": ["兵学", "战略", "经典"],
          "content": "# 孙子兵法\n\n**作者**：孙武\n\n## 名句\n- 知己知彼，百战不殆。\n- 不战而屈人之兵。\n- 兵者，诡道也。\n\n## 应用\n不止于战争，商战、职场竞争皆可用。"},
     ]},
    {"id": "finance",    "name": "金融理财",    "color": "#06D6A0", "size": 1.40, "orbitRadius": 47.0,  "speed": 0.24,
     "satellites": [
         {"title": "穷爸爸富爸爸", "author": "罗伯特·清崎", "summary": "资产与负债的启蒙，财商教育入门。",
          "tags": ["财商", "入门", "理财"],
          "content": "# 穷爸爸富爸爸\n\n**作者**：罗伯特·清崎（Robert Kiyosaki）\n\n## 核心概念\n- **资产**带来现金流，**负债**拿走现金流。\n- 让钱为你工作，而非为钱工作。\n- 财商（财务知识）比单纯努力更重要。\n\n## 行动\n先分清你买的是资产还是负债。"},
         {"title": "聪明的投资者", "author": "本杰明·格雷厄姆", "summary": "价值投资圣经，安全边际思想源头。",
          "tags": ["价值投资", "巴菲特", "经典"],
          "content": "# 聪明的投资者\n\n**作者**：本杰明·格雷厄姆（Benjamin Graham）\n\n## 要义\n- **安全边际**：价格显著低于内在价值才买。\n- 市场先生：情绪化，可利用不可盲从。\n- 防御型 vs 进取型投资者。\n\n## 地位\n巴菲特称其为「有史以来最佳投资书」。"},
     ]},
    {"id": "management", "name": "经营管理",    "color": "#FF9F1C", "size": 1.22, "orbitRadius": 51.5,  "speed": 0.22,
     "satellites": [
         {"title": "高效能人士的七个习惯", "author": "史蒂芬·柯维", "summary": "从依赖到互赖，个人与团队效能框架。",
          "tags": ["效能", "自我管理", "职场"],
          "content": "# 高效能人士的七个习惯\n\n**作者**：史蒂芬·柯维（Stephen Covey）\n\n## 习惯\n1. 积极主动\n2. 以终为始\n3. 要事第一\n4. 双赢思维\n5. 知彼解己\n6. 统合综效\n7. 不断更新\n\n## 内核\n由内而外，原则为中心。"},
     ]},
    {"id": "fiction",    "name": "小说",        "color": "#E0715B", "size": 1.33, "orbitRadius": 56.0,  "speed": 0.20,
     "satellites": [
         {"title": "百年孤独", "author": "加西亚·马尔克斯", "summary": "魔幻现实主义巅峰，布恩迪亚家族七代兴衰。",
          "tags": ["魔幻现实", "小说", "经典"],
          "content": "# 百年孤独\n\n**作者**：加西亚·马尔克斯（Gabriel García Márquez）\n\n## 标签\n- 魔幻现实主义\n- 孤独的宿命\n- 循环的时间\n\n## 一句\n生命中曾经有过的所有灿烂，终究都需要用寂寞来偿还。"},
     ]},
    {"id": "art",        "name": "艺术",        "color": "#F15BB5", "size": 1.15, "orbitRadius": 60.5,  "speed": 0.19,
     "satellites": [
         {"title": "艺术的故事", "author": "贡布里希", "summary": "通俗易懂的艺术史通览，从洞穴壁画到现代。",
          "tags": ["艺术史", "入门", "艺术"],
          "content": "# 艺术的故事\n\n**作者**：E.H.贡布里希（Ernst Gombrich）\n\n## 视角\n- 艺术不是「再现」，而是「观看 + 制作」的博弈。\n- 没有艺术，只有艺术家。\n\n## 价值\n艺术入门最稳妥的一本书。"},
     ]},
    {"id": "literature", "name": "文学",        "color": "#9B5DE5", "size": 1.18, "orbitRadius": 65.0,  "speed": 0.18,
     "satellites": [
         {"title": "人间词话", "author": "王国维", "summary": "古典美学境界说，诗词鉴赏的标尺。",
          "tags": ["诗词", "美学", "古典"],
          "content": "# 人间词话\n\n**作者**：王国维\n\n## 境界说\n- 有我之境 vs 无我之境。\n- 古今成大事业者三重境界：\n  1. 独上高楼，望尽天涯路。\n  2. 衣带渐宽终不悔。\n  3. 蓦然回首，那人却在灯火阑珊处。\n\n## 价值\n读懂中国诗词美学的钥匙。"},
     ]},
    {"id": "medicine",   "name": "医学健康",    "color": "#00BBF9", "size": 1.24, "orbitRadius": 69.5,  "speed": 0.17,
     "satellites": [
         {"title": "中国居民膳食指南", "author": "中国营养学会", "summary": "科学饮食的权威参照，平衡膳食宝塔。",
          "tags": ["健康", "饮食", "科普"],
          "content": "# 中国居民膳食指南（要点）\n\n**来源**：中国营养学会\n\n## 核心推荐\n- 食物多样，谷类为主。\n- 吃动平衡，健康体重。\n- 多吃蔬果、奶类、大豆。\n- 适量吃鱼禽蛋瘦肉。\n- 少盐少油，控糖限酒。\n\n## 提醒\n本卡片仅为科普，具体健康问题请遵医嘱。"},
     ]},
    {"id": "life",       "name": "生活百科",    "color": "#80ED99", "size": 1.12, "orbitRadius": 74.0,  "speed": 0.16,
     "satellites": [
         {"title": "断舍离", "author": "山下英子", "summary": "通过整理物品整理人生，极简生活入门。",
          "tags": ["极简", "生活", "整理"],
          "content": "# 断舍离\n\n**作者**：山下英子\n\n## 三字诀\n- **断**：不买不需要的。\n- **舍**：处理掉多余的。\n- **离**：脱离对物品的执念。\n\n## 本质\n不是扔东西，是重新拿回人生的主动权。"},
     ]},
    {"id": "poetry",     "name": "诗歌散文",    "color": "#FEE440", "size": 1.05, "orbitRadius": 78.5,  "speed": 0.15,
     "satellites": [
         {"title": "飞鸟集", "author": "泰戈尔", "summary": "短小哲思诗句，自然与爱的吟唱。",
          "tags": ["诗歌", "泰戈尔", "哲思"],
          "content": "# 飞鸟集（选）\n\n**作者**：泰戈尔（Rabindranath Tagore）\n\n> 生如夏花之绚烂，死如秋叶之静美。\n\n> 如果你因错过太阳而流泪，那么你也将错过群星。\n\n## 气质\n凝练、温柔、充满东方禅意。"},
     ]},
]


def build():
    for c in CATEGORIES:
        for i, s in enumerate(c["satellites"], 1):
            s["id"] = f'{c["id"]}-{i}'
            s.setdefault("tags", [])
            s["cover"] = s.get("cover", "")
    return {"categories": CATEGORIES}


def main():
    data = build()

    # 1) 写 knowledge.json（仅元数据，去掉 content）
    json_data = {"categories": []}
    for c in data["categories"]:
        cc = dict(c)
        cc["satellites"] = []
        for s in c["satellites"]:
            meta = {k: v for k, v in s.items() if k != "content"}
            cc["satellites"].append(meta)
        json_data["categories"].append(cc)
    os.makedirs(os.path.join(BASE, "data"), exist_ok=True)
    with open(os.path.join(BASE, "data", "knowledge.json"), "w", encoding="utf-8") as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)

    # 2) 写每本书的 .md
    for c in data["categories"]:
        d = os.path.join(BASE, "books", c["id"])
        os.makedirs(d, exist_ok=True)
        for s in c["satellites"]:
            with open(os.path.join(d, s["id"] + ".md"), "w", encoding="utf-8") as f:
                f.write(s["content"])

    # 3) 写 seed.js（离线兜底，含 content）
    with open(os.path.join(BASE, "js", "seed.js"), "w", encoding="utf-8") as f:
        f.write("// 自动生成，请勿手改。离线兜底数据（含 content）。\n")
        f.write("window.SEED_DATA = ")
        f.write(json.dumps(data, ensure_ascii=False, indent=2))
        f.write(";\n")

    print("written: knowledge.json +", sum(len(c['satellites']) for c in data['categories']), "本 .md + seed.js")
    print("categories:", len(data["categories"]),
          "satellites:", sum(len(c["satellites"]) for c in data["categories"]))


if __name__ == "__main__":
    main()
