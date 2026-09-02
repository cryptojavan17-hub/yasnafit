#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
یاردم‌کننده ساخت «نمونه برنامه تمرینی» بر اساس بانک حرکات yasnaFit
Helper for building training-program samples using the real movement bank.

Usage examples:
  python3 tool/program-helper.py search "جلو پا" --loc باشگاه --cat حرکات پا
  python3 tool/program-helper.py categories --loc باشگاه
  python3 tool/program-helper.py info 39
"""
import json
import argparse
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(BASE, 'data-source', 'exercises_data.json')

# تعداد حرکت لازم برای هر سیستم تمرینی (طبق «افزودن نمونه برنامه تمرینی»)
TRAINING_SYSTEMS = {
    'معمولی': 1,
    'سیستم تمرینی رست پاز': 1,
    'سیستم تمرینی دراپ ست': 1,
    'سیستم تمرینی پس خستگی': 1,
    'سیستم تمرینی FST7': 1,
    'سیستم تمرینی ۲۱': 1,
    'سیستم تمرینی سوپر ست': 2,
    'سیستم تمرینی تکرار نیمه': 2,
    'سیستم تمرینی تری ست': 3,
    'سیستم تمرینی ۲۰-۱۰-۵': 3,
    'سیستم تمرینی جايت ست': 4,
    'سیستم تمرینی ماموت ست': 5,
}

FA_DIGITS = str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹')


def fa_num(n):
    return str(n).translate(FA_DIGITS)


def load():
    with open(DATA_FILE, encoding='utf-8') as f:
        data = json.load(f)
    cats = {c['id']: c for c in data['categories']}
    movs = [m for m in data['movements'] if not m.get('is_removed')]
    return data, cats, movs


def video_path(m, cats):
    """مسیر فایل ویدیو طبق ساختار exercises_organized/[محل]/[دسته]/videos/[ID]_[نام].mp4"""
    cat_title = cats.get(m['categoryId'], {}).get('title', 'نامشخص')
    return "exercises_organized/{loc}/{cat}/videos/{id}_{title}.mp4".format(
        loc=m['location'], cat=cat_title, id=m['id'], title=m['title'])


def norm(s):
    """یکسان‌سازی حروف عربی/فارسی و حذف فاصله‌های اضافی برای جست‌وجوی بهتر"""
    s = s.replace('ي', 'ی').replace('ك', 'ک').replace('‌', ' ').replace('\u200c', ' ')
    return re.sub(r'\s+', ' ', s).strip()


def main():
    p = argparse.ArgumentParser(description='(program-helper)')
    sub = p.add_subparsers(dest='cmd', required=True)

    s = sub.add_parser('search', help='جست‌وجوی حرکت در بانک')
    s.add_argument('query')
    s.add_argument('--loc', choices=['باشگاه', 'منزل'])
    s.add_argument('--cat', help='نام دسته مثل: حرکات پا')

    s = sub.add_parser('categories', help='فهرست دسته‌ها')
    s.add_argument('--loc', choices=['باشگاه', 'منزل'])

    s = sub.add_parser('info', help='مشخصات یک حرکت با ID')
    s.add_argument('id', type=int)

    s = sub.add_parser('list', help='حرکات یک دسته')
    s.add_argument('--loc', required=True, choices=['باشگاه', 'منزل'])
    s.add_argument('--cat', required=True)
    s.add_argument('--limit', type=int, default=40)

    args = p.parse_args()
    data, cats, movs = load()

    if args.cmd == 'categories':
        from collections import Counter
        cnt = Counter(m['categoryId'] for m in movs if not args.loc or m['location'] == args.loc)
        for cid, n in sorted(cnt.items(), key=lambda x: -x[1]):
            if cats[cid]['parentId'] is None:
                print(f"{cid}\t{cats[cid]['title']}\t{fa_num(n)} حرکت")
        return

    if args.cmd == 'info':
        m = next((x for x in movs if x['id'] == args.id), None)
        if not m:
            print('یافت نشد'); sys.exit(1)
        cat = cats.get(m['categoryId'], {})
        sub = cats.get(m.get('subCat'), {})
        print(json.dumps({
            'id': m['id'], 'title': m['title'], 'location': m['location'],
            'category': cat.get('title'), 'sub_category': sub.get('title'),
            'equipment_priority': m.get('priority'),
            'video': m.get('video'),
            'video_file': video_path(m, cats),
        }, ensure_ascii=False, indent=2))
        return

    if args.cmd == 'search':
        q = norm(args.query)
        hits = [m for m in movs
                if q in norm(m['title'])
                and (not args.loc or m['location'] == args.loc)
                and (not args.cat or norm(cats[m['categoryId']]['title']) == norm(args.cat))]
        for m in hits:
            print(f"{m['id']}\t{m['title']}\t{m['location']}\t{cats[m['categoryId']]['title']}")
        if not hits:
            print('(یافت نشد)')
        return

    if args.cmd == 'list':
        hits = [m for m in movs
                if m['location'] == args.loc
                and norm(cats[m['categoryId']]['title']) == norm(args.cat)]
        for m in hits[:args.limit]:
            print(f"{m['id']}\t{m['title']}")
        print(f'... جمع: {fa_num(len(hits))} حرکت')


if __name__ == '__main__':
    main()
