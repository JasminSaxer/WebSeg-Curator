from PIL import Image, ImageDraw
import pandas as pd
import ast 
import os
import sys
from typing import Literal

def combine_stored_answers(res_folder, png_col):
    df_stored = pd.read_csv(os.path.join(res_folder, 'Stored.csv'))
    df_stored['pid'] = df_stored['pid'].str.extract(r'ObjectId\("(.+)"\)')
    pid_key_map = df_stored.set_index('pid')[png_col].to_dict()
    
    
    df_answers = pd.read_csv(os.path.join(res_folder, 'Answer.csv'))
    
    # Step 1: Extract the string value from the ObjectId fields
    df_answers['_id'] = df_answers['_id'].str.extract(r'ObjectId\("(.+)"\)')
    df_answers['pid'] = df_answers['pid'].str.extract(r'ObjectId\("(.+)"\)')
    df_answers['boundingBox'] = df_answers['boundingBox'].apply(ast.literal_eval)
    df_answers['hyuIndex'] = df_answers['hyuIndex'].astype(int)
    
    return df_answers, pid_key_map
    
    
    
def do_all_segments(res_folder:str, png_folder:str, png_col:str, do: Literal['crop', 'overlay'], filter_userid:str=None):
    """
    Perform cropping or overlay of segments on all Stored Pages.
    Args:
        res_folder (str): The path to the folder containing the Answer.csv and Stored.csv from the mongo Db.
        png_folder (str): The path to the folder containing the PNG files.
        png_col (str): The column name of the PNG files.
        do (str): The operation to be performed on the segments ['crop' or 'overlay'].
        filter_userid (str, optional): The user ID to filter the answers. Defaults to None.
    """   
    df_answers, pid_key_map = combine_stored_answers(res_folder, png_col)
    new_folder = os.path.join(png_folder + '_' + do)
    if not os.path.exists(new_folder):
        os.makedirs(new_folder)
    
    if filter_userid:
        df_answers = df_answers[df_answers['userId'] == filter_userid]
    df_grouped = df_answers.groupby('pid')
    df_grouped.apply(do_segments_per_pid, pid_key_map, png_folder, new_folder, do)

def do_segments_per_pid(df_pid, pid_key_map, png_folder, new_folder, do):
    pid = df_pid['pid'].iloc[0]
    key = pid_key_map[pid]
    if do == 'overlay':
        save_file = os.path.join(new_folder, key + '_overlay.png')
        if os.path.exists(save_file):
            return
    user_color_map = get_color_map(df_pid['userId'].unique())
    png_path = os.path.join(png_folder, key + '.png')
    image = Image.open(png_path)

    
    for index, row in df_pid.iterrows():
        boundingBox = row['boundingBox']
        x, y = boundingBox['x'], boundingBox['y']
        width, height = boundingBox['width'], boundingBox['height']
        crop_box = (x, y, x + width, y + height)
        
        if do == 'overlay':
            overlay = Image.new('RGBA', image.size, (255, 255, 255, 0))
            draw = ImageDraw.Draw(overlay)
            draw.rectangle(crop_box, fill=user_color_map[row['userId']], outline=user_color_map[row['userId']][:3])
            image = Image.alpha_composite(image.convert('RGBA'), overlay)  
        elif do == 'crop':
            path_croped = os.path.join(new_folder, f"{key}_{row['hyuIndex']}.png")
            if os.path.exists(path_croped):
                continue
            cropped_image = image.crop(crop_box)  
            cropped_image.save(path_croped)
        else:
            print(f'Invalid operation: {do}')
            
    if do == 'overlay':
        image.save(save_file)
    
def get_color_map(userIds):
    distinct_colors = [
    (255, 0, 0, 76),    # Red
    (0, 255, 0, 76),    # Green
    (0, 0, 255, 76),    # Blue
    (255, 255, 0, 76),  # Yellow
    (255, 0, 255, 76),  # Magenta
    (0, 255, 255, 76),  # Cyan
    (255, 165, 0, 76),  # Orange
    (128, 0, 128, 76),  # Purple
    (0, 128, 128, 76),  # Teal
    (128, 128, 0, 76)   # Olive
    ]

    # Create a color map for user IDs
    user_color_map = {}
    for i, userid in enumerate(userIds):
        user_color_map[userid] = distinct_colors[i % len(distinct_colors)]
    return user_color_map



    
if __name__ == '__main__':
    do_all_segments('example_results', 'example_results/screenshots','key', 'overlay')
    do_all_segments('example_results', 'example_results/screenshots','key', 'crop')